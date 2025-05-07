const express = require('express');
const publicIp = require('public-ip');
const app = express();
const alertController = require('./alertController');

// Middleware
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Yieldera Alerts Backend is live!');
});

// Alert test route
app.post('/alerts/:id/test', alertController.testAlert);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Yieldera Alerts server running on port ${PORT}`);

  // Log outbound IP
  try {
    const ip = await publicIp.v4();
    console.log(`🌍 Public outbound IP: ${ip}`);
  } catch (err) {
    console.error('⚠️ Failed to get public IP:', err.message);
  }
});
