
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./apiRoutes');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api', routes);

// Health check route
app.get('/', (req, res) => {
  res.send('🌾 Yieldera Alert API is live!');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Yieldera Alerts server running on port ${PORT}`);
});

// Async DB connection test for mysql2/promise
const db = require('./database');
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connection established.');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
  }
})();

// Start alert monitor background engine
require('./alertMonitor');
