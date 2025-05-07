// server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testAlert } = require('./alertController');

const app = express();

app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('✅ Yieldera Alerts Backend is live!');
});

// Test alert route
app.post('/alerts/:id/test', testAlert);

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Yieldera Alerts server running on port ${PORT}`);
});
