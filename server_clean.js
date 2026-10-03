const express = require('express');
const path = require('path');
const config = require('./config');
// const engine = require('./engine');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => {
  try {
    const rawState = JSON.parse(fs.readFileSync('./data/state.json', 'utf8'));
    const positions = rawState.positions || {};
    
    let activeMajor = 0;
    let activeHunter = 0;
    let totalUsedMargin = 0;
    let totalLivePnl = 0;

    Object.keys(positions).forEach(sym => {
      const p = positions[sym];
      if (p && p.inPosition !== false) {
        if (p.type === 'MAJOR') activeMajor++;
        else activeHunter++;
        
        const m = Number(p.totalMargin || p.margin || 0);
        const pnl = Number(p.livePnl !== undefined ? p.livePnl : (p.unrealizedPnl || 0));
        totalUsedMargin += m;
        totalLivePnl += pnl;
      }
    });

    const currentTotalEquity = Number(rawState.stats.currentTotalEquity || 10000.00);
    const freeMargin = parseFloat((currentTotalEquity - totalUsedMargin).toFixed(2));

    const enrichedStats = {
      ...rawState.stats,
      usedMargin: parseFloat(totalUsedMargin.toFixed(2)),
      freeMargin: freeMargin,
      liveUnrealizedPnl: parseFloat(totalLivePnl.toFixed(2))
    };

    res.json({
      ...rawState,
      stats: enrichedStats,
      counts: {
        major: activeMajor,
        majorLimit: 12,
        hunter: activeHunter,
        hunterLimit: 13,
        total: activeMajor + activeHunter,
        totalLimit: 25,
        balonText: "0 (PASİF)"
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'API hatası', details: err.message });
  }
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`[FUTURESX] Sunucu http://localhost:${config.PORT} adresinde aktif.`);
});
