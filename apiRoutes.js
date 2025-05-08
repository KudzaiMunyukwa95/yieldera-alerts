// apiRoutes.js - Express routes for the alert API

const express = require('express');
const router = express.Router();
const alertController = require('./alertController');

// Alert CRUD
router.get('/alerts', alertController.getAllAlerts);
router.get('/alerts/:id', alertController.getAlertById);
router.post('/alerts', alertController.createAlert);
router.put('/alerts/:id', alertController.updateAlert);
router.delete('/alerts/:id', alertController.deleteAlert);

// Alert Test
router.post('/alerts/:id/test', alertController.testAlert);

// Optional/Placeholder Endpoints
router.get('/alerts/:id/history', alertController.getAlertHistory);
router.get('/alerts/stats', alertController.getAlertStats);

module.exports = router;
