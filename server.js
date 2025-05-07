// server.js - Entry point for Yieldera Alerts backend

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();

// Load environment variables
dotenv.config();

// Import alert controller
const alertController = require('./alertController');

// Middleware
app.use(cors());
app.use(express.json());

// Root test route
app.get('/', (req, res) => {
  res.send('Yieldera Alerts Backend is live!');
});

// Mount all routes from alertController under /alerts
app.use('/alerts', alertController);

// Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Yieldera Alerts server running on port ${PORT}`);
});
