module.exports = {
  PORT: 3001,
  POLL_INTERVAL: 1000,
  SCANNER_INTERVAL_MS: 60000, // 60 saniyede bir Gainers/Losers ve Hacimli Balon taraması

  MAJOR_SYMBOLS: [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", 
    "XRPUSDT", "DOGEUSDT", "ADAUSDT", "SUIUSDT", 
    "AVAXUSDT", "NEARUSDT", "LINKUSDT", "XLMUSDT",
    "LTCUSDT", "DOTUSDT", "UNIUSDT"
  ],

  HUNTER_SYMBOLS: [
    "APTUSDT", "SEIUSDT", "INJUSDT", "TIAUSDT", 
    "RENDERUSDT", "FETUSDT", "TAOUSDT", "WLDUSDT", 
    "ARBUSDT", "OPUSDT", "PEPEUSDT", "SHIBUSDT", 
    "AAVEUSDT", "ATOMUSDT", "FILUSDT", "ICPUSDT", 
    "KASUSDT", "CRVUSDT", "STXUSDT", "GALAUSDT", 
    "CFXUSDT", "RUNEUSDT", "BLURUSDT", "SNXUSDT", 
    "LDOUSDT", "WIFUSDT", "THETAUSDT", "AXSUSDT", 
    "GRTUSDT", "SANDUSDT", "MANAUSDT", "FLOWUSDT"
  ],

  // Balon potansiyeli yüksek pariteler (En yüksek hacimli 5 tanesi dinamik seçilir)
  BALON_CANDIDATES: [
    "MOVRUSDT", "FLOCKUSDT", "MONUSDT", "SYNUSDT", "CTUSDT", 
    "CAPUSDT", "LYNUSDT", "BTWUSDT", "USUSDT", "APEUSDT", 
    "MAGICUSDT", "SKYUSDT", "STGUSDT", "ZROUSDT", "NIGHTUSDT"
  ],

  // KESİN KARA LİSTE (Hiçbir havuzdan işleme alınamaz)
  BLACKLIST: [
    "BTWUSDT",
    "STRKUSDT",
    "COLLECTUSDT",
    "SANDUSDT",
    "ICPUSDT",
    "AXSUSDT",
    "BRUSDT",
    "USUSDT",
    "GALAUSDT",
    "MUBARAKUSDT",
    "TIAUSDT",
    "AVAXUSDT",
    "FILUSDT",
    "MAGMAUSDT",
    "MOVRUSDT",
    "GTCUSDT",
    "MAGICUSDT",
    "2ZUSDT",
    "SCRUSDT",
    "NIGHTUSDT",
    "CAPUSDT"
],

  LIMITS: {
    MAX_TOTAL_SLOTS: 50,
    MAX_MAJOR_SLOTS: 10,
    MAX_HUNTER_SLOTS: 15,
    MAX_BALON_SLOTS: 0,
    MAX_GAINER_SLOTS: 15,
    MAX_LOSER_SLOTS: 10,
  },

  // Kategori bazlı sermaye ve kâr/zarar kuralları (3X Kaldıraç)
  TIERS: {
    MAJOR: {
      MARGIN: 100.0,
      MAIN_TP_USD: 2.20,
      ROTATION_TP_USD: 0.80,
      ROTATION_TIMEOUT_SEC: 300,
      DCA_1_TRIGGER_PCT: -1.2,
      DCA_2_TRIGGER_PCT: -2.4,
      STOP_LOSS_USD: -7.50
    },
    HUNTER: {
      MARGIN: 60.0,
      MAIN_TP_USD: 2.20,
      ROTATION_TP_USD: 0.80,
      ROTATION_TIMEOUT_SEC: 300,
      DCA_1_TRIGGER_PCT: -1.5,
      DCA_2_TRIGGER_PCT: -2.5,
      STOP_LOSS_USD: -6.50
    },
    BALON: {
      MARGIN: 40.0,
      MAIN_TP_USD: 2.20,
      ROTATION_TP_USD: 0.80,
      ROTATION_TIMEOUT_SEC: 300,
      DCA_ENABLED: false,        // Balonlarda DCA yok (Tek kurşun ortalamaya dönüş)
      STOP_LOSS_USD: -3.50,      // Sıkı stop loss
      // İndikatör Tetikleyicileri
      Z_SCORE_THRESHOLD: 1.8,
      RSI_OVERBOUGHT: 70,
      RSI_OVERSOLD: 30
    },
    GAINER: {
      MARGIN: 50.0,
      MAIN_TP_USD: 2.20,
      ROTATION_TP_USD: 0.80,
      ROTATION_TIMEOUT_SEC: 300,
      DCA_1_TRIGGER_PCT: -2.0,
      DCA_2_TRIGGER_PCT: null,   // Tek kademe DCA
      STOP_LOSS_USD: -5.00,
      MIN_24H_PCT: 7.0,
      MIN_VOLUME_USD: 25000000
    },
    LOSER: {
      MARGIN: 50.0,
      MAIN_TP_USD: 2.20,
      ROTATION_TP_USD: 0.80,
      ROTATION_TIMEOUT_SEC: 300,
      DCA_1_TRIGGER_PCT: -2.0,
      DCA_2_TRIGGER_PCT: null,   // Tek kademe DCA
      STOP_LOSS_USD: -5.00,
      MAX_24H_PCT: -7.0,
      MIN_VOLUME_USD: 25000000
    }
  },

  INITIAL_BALANCE: 10000.00,
  INITIAL_BNB: 1.0000
};
