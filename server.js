const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./apiRoutes');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// API routes
app.use('/api', routes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'yieldera-alerts-api',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('🌾 Yieldera Alert API is live!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? err.message : err.stack
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Yieldera Alerts API running on port ${PORT}`);
});

// Database connection test
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connection established.');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1); // Exit if DB connection fails
  }
})();

module.exports = app;
