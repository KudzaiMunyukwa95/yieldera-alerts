const express = require('express');
const app = express();
const alertController = require('./alertController');

app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Yieldera Alerts Backend is live!');
});

// Alert test route
app.post('/alerts/:id/test', alertController.testAlert);

// You can add more routes here...

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Yieldera Alerts server running on port ${PORT}`);
});
