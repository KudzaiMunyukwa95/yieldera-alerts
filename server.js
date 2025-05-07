const express = require('express');
const cors = require('cors');
const app = express();

require('dotenv').config(); // load environment variables

const alertController = require('./alertController');

app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('Yieldera Alerts Backend is live!');
});

// Mount all alert routes from controller
app.use('/alerts', alertController);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Yieldera Alerts server running on port ${PORT}`);
});

app.post('/alerts/test-dummy', (req, res) => {
  res.json({ success: true, message: 'Test POST route working!' });
});

