// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testAlert } = require('./alertController');
const db = require('./database'); // ✅ Import DB module

const app = express();

app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('✅ Yieldera Alerts Backend is live!');
});

// Test alert route
app.post('/alerts/:id/test', testAlert);

// ✅ DB Connection Check Route
app.get('/db-check', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    res.json({ success: true, result: rows[0].result });
  } catch (error) {
    console.error('DB connection test failed:', error);
    res.status(500).json({ success: false, message: 'Failed to connect to DB', error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Yieldera Alerts server running on port ${PORT}`);
});
