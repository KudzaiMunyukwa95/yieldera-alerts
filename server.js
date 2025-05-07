// server.js - Entry point for Yieldera Alerts API

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const alertRoutes = require('./alertController');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/alerts', alertRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.send('✅ Yieldera Alerts API is running.');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
