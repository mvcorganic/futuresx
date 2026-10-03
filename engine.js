
function isValidSymbol(sym) {
  // Sadece standart Latin harfleri ve rakamlar (orn: BTCUSDT, 1000PEPEUSDT)
  return typeof sym === "string" && /^[A-Z0-9]+$/.test(sym);
}
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');

const STATE_FILE = path.join(__dirname, 'data', 'state.json');

// Bellek İçi Durum
let state = {
  stats: {
    currentTotalEquity: config.INITIAL_BALANCE,
    freeMargin: config.INITIAL_BALANCE,
    usedMargin: 0.0,
    liveUnrealizedPnl: 0.0,
    todayClosedPnl: 0.0,
    totalClosedPnl: 0.0,
    todayLoss: 0.0,
    totalTrades: 0,
    winTrades: 0,
    bnbBalance: config.INITIAL_BNB,
    totalBnbFee: 0.0
  },
  positions: {},
  history: []
};

// Durumu Yükle
if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error("State yüklenirken hata oluştu:", e.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error("State kaydedilemedi:", e.message);
  }
}

// REST Polling Yardımcısı (3s Timeout Korumalı)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 3000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// Dinamik Sembol Listeleri
let dynamicGainers = [];
let dynamicLosers = [];
let dynamicBalon = [];

// Fiyat ve İndikatör Geçmişi (EMA, RSI, Z-Skor)
const priceTracker = {};

function updateIndicators(symbol, price) {
  if (!priceTracker[symbol]) {
    priceTracker[symbol] = {
      prices: [],
      ema20: price,
      rsiHistory: [],
      current: price
    };
  }
  const t = priceTracker[symbol];
  t.current = price;
  t.prices.push(price);
  if (t.prices.length > 50) t.prices.shift();

  // EMA20 Hesaplama (k = 2 / (20 + 1))
  const k = 2 / 21;
  t.ema20 = (price * k) + (t.ema20 * (1 - k));

  // Z-Skor Hesaplama (Son 20 periyot)
  if (t.prices.length >= 10) {
    const recent = t.prices.slice(-20);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance) || 0.00001;
    t.zScore = (price - mean) / stdDev;
  } else {
    t.zScore = 0;
  }

  // Mini RSI(14) Hesaplama
  if (t.prices.length >= 15) {
    let gains = 0, losses = 0;
    const rPrices = t.prices.slice(-15);
    for (let i = 1; i < rPrices.length; i++) {
      const diff = rPrices[i] - rPrices[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : (gains / 14) / (losses / 14);
    t.rsi = 100 - (100 / (1 + rs));
  } else {
    t.rsi = 50;
  }
}

// 1. Dinamik Piyasa Tarayıcısı (Binance 24hr Ticker)
async function scanMarket() {
  try {
    const tickers = await fetchJson('https://fapi.binance.com/fapi/v1/ticker/24hr');
    if (!Array.isArray(tickers)) return;

    const usdtPairs = tickers.filter(t => 
      t.symbol.endsWith('USDT') && isValidSymbol(t.symbol) && 
      !config.MAJOR_SYMBOLS.includes(t.symbol) && 
      !config.HUNTER_SYMBOLS.includes(t.symbol) &&
      parseFloat(t.quoteVolume) >= (config.TIERS.GAINER.MIN_VOLUME_USD || 25000000)
    );

    // En çok artanlar (Gainers)
    const sortedGainers = [...usdtPairs].sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
    dynamicGainers = sortedGainers.slice(0, 5).map(t => t.symbol);

    // En çok düşenler (Losers)
    const sortedLosers = [...usdtPairs].sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent));
    dynamicLosers = sortedLosers.slice(0, 5).map(t => t.symbol);

    // Hacimli Balon Pariteleri
    const balonTickers = tickers.filter(t => config.BALON_CANDIDATES.includes(t.symbol));
    balonTickers.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    dynamicBalon = balonTickers.slice(0, 5).map(t => t.symbol);

  } catch (err) {
    // Sessiz hata toleransı
  }
}

// 2. Fiyat Güncelleme ve Sinyal Döngüsü
async function tick() {
    // Latin dışı sembol varsa anında kapat
    for (const sym in state.positions) {
      if (!isValidSymbol(sym)) {
        closePosition(sym, 0.0, "Karakter Filtresi (Latin Dışı)");
      }
    }
  try {
    const prices = await fetchJson('https://fapi.binance.com/fapi/v1/ticker/price');
    if (!Array.isArray(prices)) return;

    const pMap = {};
    for (const p of prices) {
      const pr = parseFloat(p.price);
      pMap[p.symbol] = pr;
      updateIndicators(p.symbol, pr);
    }

    // Pozisyonları Değerlendir (TP, SL, Rotasyon, DCA)
    processPositions(pMap);

    // Yeni Pozisyon Sinyallerini Tara
    evaluateEntries(pMap);

    // Kasa İstatistiklerini Güncelle
    updateStats(pMap);

    saveState();
  } catch (err) {}
}

function getActiveCounts() {
  const c = { total: 0, major: 0, hunter: 0, balon: 0, gainer: 0, loser: 0 };
  for (const sym in state.positions) {
    c.total++;
    const t = state.positions[sym].type;
    if (t === 'MAJOR') c.major++;
    else if (t === 'HUNTER') c.hunter++;
    else if (t === 'BALON') c.balon++;
    else if (t === 'GAINER') c.gainer++;
    else if (t === 'LOSER') c.loser++;
  }
  return c;
}

function evaluateEntries(pMap) {
  const counts = getActiveCounts();
  if (counts.total >= config.LIMITS.MAX_TOTAL_SLOTS) return;

  // 1. Majör Havuzu
  if (counts.major < config.LIMITS.MAX_MAJOR_SLOTS) {
    for (const sym of config.MAJOR_SYMBOLS) {
      if (!state.positions[sym] && pMap[sym]) tryOpenPosition(sym, 'MAJOR', pMap[sym]);
    }
  }

  // 2. Avcı Havuzu
  if (counts.hunter < config.LIMITS.MAX_HUNTER_SLOTS) {
    for (const sym of config.HUNTER_SYMBOLS) {
      if (!state.positions[sym] && pMap[sym]) tryOpenPosition(sym, 'HUNTER', pMap[sym]);
    }
  }

  // 3. Balon Havuzu (Özel Göstergeler: Z-Skor ve RSI)
  if (counts.balon < config.LIMITS.MAX_BALON_SLOTS) {
    for (const sym of dynamicBalon) {
      if (!state.positions[sym] && pMap[sym]) {
        const ind = priceTracker[sym];
        if (ind && ind.zScore && ind.rsi) {
          if (ind.zScore >= config.TIERS.BALON.Z_SCORE_THRESHOLD && ind.rsi >= config.TIERS.BALON.RSI_OVERBOUGHT) {
            openPosition(sym, 'BALON', 'SHORT', pMap[sym]);
          } else if (ind.zScore <= -config.TIERS.BALON.Z_SCORE_THRESHOLD && ind.rsi <= config.TIERS.BALON.RSI_OVERSOLD) {
            openPosition(sym, 'BALON', 'LONG', pMap[sym]);
          }
        }
      }
    }
  }

  // 4. Gainers Havuzu (Geri Çekilme / Tepe Reddi)
  if (counts.gainer < config.LIMITS.MAX_GAINER_SLOTS) {
    for (const sym of dynamicGainers) {
      if (!state.positions[sym] && pMap[sym]) {
        const ind = priceTracker[sym];
        if (ind && ind.rsi >= 72) {
          openPosition(sym, 'GAINER', 'SHORT', pMap[sym]);
        }
      }
    }
  }

  // 5. Losers Havuzu (Dip Tepkisi / Aşırı Satım Sekmesi)
  if (counts.loser < config.LIMITS.MAX_LOSER_SLOTS) {
    for (const sym of dynamicLosers) {
      if (!state.positions[sym] && pMap[sym]) {
        const ind = priceTracker[sym];
        if (ind && ind.rsi <= 28) {
          openPosition(sym, 'LOSER', 'LONG', pMap[sym]);
        }
      }
    }
  }
}

function tryOpenPosition(symbol, type, price) {
  const ind = priceTracker[symbol];
  if (!ind || ind.prices.length < 3) return;

  const lastPrices = ind.prices.slice(-3);
  const delta = (price - lastPrices[0]) / lastPrices[0];

  // Mikro-dalgalanma tetikleyici
  if (delta <= -0.0008) openPosition(symbol, type, 'LONG', price);
  else if (delta >= 0.0008) openPosition(symbol, type, 'SHORT', price);
}

function openPosition(symbol, type, side, price) {
  if (!isValidSymbol(symbol)) {
    console.warn(`[ENGEL] Standart dışı sembol reddedildi: ${symbol}`);
    return;
  }
  const tier = config.TIERS[type];
  if (state.stats.freeMargin < tier.MARGIN) return;

  state.positions[symbol] = {
    symbol,
    type,
    side,
    entryPrice: price,
    avgPrice: price,
    curPrice: price,
    margin: tier.MARGIN,
    totalMargin: tier.MARGIN,
    leverage: 3,
    dcaStep: 0,
    startTime: Date.now(),
    minPnl: 0.0,
    maxPnl: 0.0
  };

  state.stats.freeMargin -= tier.MARGIN;
  state.stats.usedMargin += tier.MARGIN;
}

function processPositions(pMap) {
  const now = Date.now();

  for (const sym in state.positions) {
    const pos = state.positions[sym];
    const curP = pMap[sym];
    if (!curP) continue;

    pos.curPrice = curP;
    const tier = config.TIERS[pos.type];

    // PnL Hesapla (3X)
    const priceRatio = pos.side === 'LONG' ? (curP - pos.avgPrice) / pos.avgPrice : (pos.avgPrice - curP) / pos.avgPrice;
    const livePnl = pos.totalMargin * pos.leverage * priceRatio;
    pos.livePnl = livePnl;

    if (livePnl < pos.minPnl) pos.minPnl = livePnl;
    if (livePnl > pos.maxPnl) pos.maxPnl = livePnl;

    // 1. Ana Kâr Hedefi (Take Profit)
    if (livePnl >= tier.MAIN_TP_USD) {
      closePosition(sym, livePnl, `3x Kâr (+$${livePnl.toFixed(2)})`);
      continue;
    }

    // 2. Slot Rotasyonu (Süre aşımı veya kâr koruma)
    const elapsedSec = (now - pos.startTime) / 1000;
    if (elapsedSec >= tier.ROTATION_TIMEOUT_SEC && livePnl >= tier.ROTATION_TP_USD) {
      closePosition(sym, livePnl, `Slot Rotasyonu (+$${livePnl.toFixed(2)})`);
      continue;
    }

    // 3. Stop Loss Koruması
    if (livePnl <= tier.STOP_LOSS_USD) {
      closePosition(sym, livePnl, `Stop Zarar (-$${Math.abs(livePnl).toFixed(2)})`);
      continue;
    }

    // 4. DCA Kademesi (Eğer aktifse)
    if (tier.DCA_1_TRIGGER_PCT !== undefined && tier.DCA_ENABLED !== false) {
      const dropPct = priceRatio * 100;
      if (pos.dcaStep === 0 && dropPct <= tier.DCA_1_TRIGGER_PCT && state.stats.freeMargin >= tier.MARGIN) {
        applyDca(pos, curP, 1);
      } else if (pos.dcaStep === 1 && tier.DCA_2_TRIGGER_PCT && dropPct <= tier.DCA_2_TRIGGER_PCT && state.stats.freeMargin >= tier.MARGIN) {
        applyDca(pos, curP, 2);
      }
    }
  }
}

function applyDca(pos, price, step) {
  pos.avgPrice = (pos.avgPrice + price) / 2;
  pos.totalMargin += pos.margin;
  pos.dcaStep = step;
  state.stats.freeMargin -= pos.margin;
  state.stats.usedMargin += pos.margin;
}

function closePosition(symbol, netPnl, exitReason) {
  const pos = state.positions[symbol];
  if (!pos) return;

  const pnlNum = parseFloat(netPnl.toFixed(2));
  state.stats.todayClosedPnl = parseFloat(((state.stats.todayClosedPnl || 0) + pnlNum).toFixed(2));
  state.stats.totalClosedPnl = parseFloat(((state.stats.totalClosedPnl || 0) + pnlNum).toFixed(2));

  if (pnlNum < 0) {
    state.stats.todayLoss = parseFloat(((state.stats.todayLoss || 0) + Math.abs(pnlNum)).toFixed(2));
  } else {
    state.stats.winTrades = (state.stats.winTrades || 0) + 1;
  }

  state.stats.totalTrades++;
  state.stats.freeMargin += pos.totalMargin + pnlNum;
  state.stats.usedMargin -= pos.totalMargin;

  // %10 İndirimli BNB Komisyon Kesintisi
  const notional = pos.totalMargin * pos.leverage;
  const bnbPrice = (priceTracker["BNBUSDT"] && priceTracker["BNBUSDT"].current) ? priceTracker["BNBUSDT"].current : 600.0;
  const feeUsd = notional * 0.00040;
  const feeBnb = feeUsd / bnbPrice;
  if (state.stats.bnbBalance !== undefined) {
    state.stats.bnbBalance = Math.max(0, parseFloat((state.stats.bnbBalance - feeBnb).toFixed(6)));
    state.stats.totalBnbFee = parseFloat(((state.stats.totalBnbFee || 0) + feeBnb).toFixed(6));
  }

  // Geçmiş Dizisine Ekle (1000 İşlem Kapasitesi)
  const d = new Date();
  const timeStr = d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour12: false });

  state.history.unshift({
    time: timeStr,
    symbol: pos.symbol,
    type: pos.type,
    side: pos.side,
    pnl: pnlNum,
    exitReason: exitReason
  });

  if (state.history.length > 1000) state.history.pop();
  delete state.positions[symbol];

  console.log(`🎯 [KAPATILDI] ${symbol} (${pos.type}) | Net PnL: ${pnlNum >= 0 ? '+' : ''}$${pnlNum} | Sebep: ${exitReason}`);
}

function updateStats(pMap) {
  let unPnl = 0;
  for (const sym in state.positions) {
    const p = state.positions[sym];
    unPnl += (p.livePnl || 0);
  }
  state.stats.liveUnrealizedPnl = parseFloat(unPnl.toFixed(2));
  state.stats.currentTotalEquity = parseFloat((state.stats.freeMargin + state.stats.usedMargin + unPnl).toFixed(2));
}

// 3. API Servisi İçin Dışa Aktarılan Metotlar
function getState() {
  let majorPnl = 0, hunterPnl = 0, totalPnl = 0, totalLoss = 0, winCount = 0, lossCount = 0;

  for (const h of state.history) {
    const v = Number(h.pnl || 0);
    if (h.type === 'MAJOR') majorPnl += v;
    else hunterPnl += v;

    if (v >= 0) {
      totalPnl += v;
      winCount++;
    } else {
      totalLoss += Math.abs(v);
      lossCount++;
    }
  }

  const avgProfit = winCount > 0 ? (totalPnl / winCount) : 0;
  const avgLoss = lossCount > 0 ? (totalLoss / lossCount) : 0;

  return {
    ...state,
    counts: {
      ...getActiveCounts(),
      totalLimit: config.LIMITS.MAX_TOTAL_SLOTS,
      majorLimit: config.LIMITS.MAX_MAJOR_SLOTS,
      hunterLimit: config.LIMITS.MAX_HUNTER_SLOTS,
      balonLimit: config.LIMITS.MAX_BALON_SLOTS,
      gainerLimit: config.LIMITS.MAX_GAINER_SLOTS,
      loserLimit: config.LIMITS.MAX_LOSER_SLOTS
    },
    dailySummary: {
      totalTrades: state.stats.totalTrades || state.history.length,
      majorPnl: parseFloat(majorPnl.toFixed(2)),
      hunterPnl: parseFloat(hunterPnl.toFixed(2)),
      totalPnl: parseFloat((state.stats.todayClosedPnl || totalPnl).toFixed(2)),
      totalLoss: parseFloat((state.stats.todayLoss || totalLoss).toFixed(2)),
      avgProfit: parseFloat(avgProfit.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2))
    }
  };
}

// Döngüleri Başlat
scanMarket();
setInterval(scanMarket, config.SCANNER_INTERVAL_MS || 60000);
setInterval(tick, config.POLL_INTERVAL || 1000);

module.exports = {
  getState,
  state
};
