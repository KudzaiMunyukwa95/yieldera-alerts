// server.js - Main entry point for the Yieldera Alerts backend

const express = require('express');
const cors = require('cors');
const alertController = require('./alertController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('🌾 Yieldera Alerts Backend is live!');
});

// Mount the alerts controller
app.use('/alerts', alertController);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Yieldera Alerts server running on port ${PORT}`);
});
