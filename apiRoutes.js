// apiRoutes.js

const express = require('express');
const router = express.Router();
const alertController = require('./alertController');
const db = require('./database');

// 🌾 FIELD ROUTES
router.get('/fields', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fields ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fields',
      error: err.message
    });
  }
});

// 🌾 ALERT ROUTES
router.get('/alerts', alertController.getAllAlerts);
router.get('/alerts/:id', alertController.getAlertById);
router.post('/alerts', alertController.createAlert);
router.put('/alerts/:id', alertController.updateAlert);
router.delete('/alerts/:id', alertController.deleteAlert);
router.post('/alerts/:id/test', alertController.testAlert);

// ✅ Optional placeholder — only include if defined
if (alertController.getAlertHistory) {
  router.get('/alerts/:id/history', alertController.getAlertHistory);
}

if (alertController.getAlertStats) {
  router.get('/alerts/stats', alertController.getAlertStats);
}

module.exports = router;
