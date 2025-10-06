const http = require('http');
const db = require('./database');

// Simple health check server for the monitor
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'yieldera-alerts-monitor',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const HEALTH_PORT = process.env.HEALTH_PORT || 5001;

healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
  console.log(`💚 Health check server running on port ${HEALTH_PORT}`);
});

// Database connection test
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connection established.');
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  }
})();

// Start the alert monitor
console.log('🔄 Loading alert monitor...');
require('./alertMonitor');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  healthServer.close(() => {
    console.log('👋 Health server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  healthServer.close(() => {
    console.log('👋 Health server closed');
    process.exit(0);
  });
});
