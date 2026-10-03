const express = require('express');
const path = require('path');
const config = require('./config');
const engine = require('./engine');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Endpoint - Doğrudan motordan güncel 5'li havuz durumunu döner
app.get('/api/state', (req, res) => {
  try {
    const data = engine.getState();
    res.json(data);
  } catch (err) {
    console.error("API State Hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Temel durum kontrolü
app.get('/health', (req, res) => {
  res.json({ status: "OK", timestamp: Date.now() });
});

const PORT = config.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FuturesX Sunucusu ${PORT} portunda aktif.`);
});
