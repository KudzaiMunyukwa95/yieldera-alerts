// server.js
const express = require('express');
const cors = require('cors');
const alertController = require('./alertController');

const app = express();
app.use(cors());
app.use(express.json());

// Root health check
app.get('/', (req, res) => {
  res.send('Yieldera Alerts Backend is live!');
});

// ✅ Mount alert routes properly here
app.use('/alerts', alertController);

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Yieldera Alerts server running on port ${PORT}`);
});
