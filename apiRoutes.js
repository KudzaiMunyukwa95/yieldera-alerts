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
    res.status(500).json({ success: false, message: 'Failed to fetch fields', error: err.message });
  }
});

// 🌾 ALERT ROUTES (conditionally registered if defined)
if (typeof alertController.getAllAlerts === 'function') {
  router.get('/alerts', alertController.getAllAlerts);
}
if (typeof alertController.getAlertById === 'function') {
  router.get('/alerts/:id', alertController.getAlertById);
}
if (typeof alertController.createAlert === 'function') {
  router.post('/alerts', alertController.createAlert);
}
if (typeof alertController.updateAlert === 'function') {
  router.put('/alerts/:id', alertController.updateAlert);
}
if (typeof alertController.deleteAlert === 'function') {
  router.delete('/alerts/:id', alertController.deleteAlert);
}
if (typeof alertController.testAlert === 'function') {
  router.post('/alerts/:id/test', alertController.testAlert);
}
if (typeof alertController.getAlertHistory === 'function') {
  router.get('/alerts/:id/history', alertController.getAlertHistory);
}
if (typeof alertController.getAlertStats === 'function') {
  router.get('/alerts/stats', alertController.getAlertStats);
}

module.exports = router;
