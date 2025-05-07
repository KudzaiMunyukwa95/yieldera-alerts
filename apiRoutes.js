// apiRoutes.js - Express routes for the alert API

const express = require('express');
const router = express.Router();
const alertController = require('./alertController');

// Get all alerts
router.get('/alerts', alertController.getAllAlerts);

// Get a specific alert
router.get('/alerts/:id', alertController.getAlertById);

// Create a new alert
router.post('/alerts', alertController.createAlert);

// Update an alert
router.put('/alerts/:id', alertController.updateAlert);

// Delete an alert
router.delete('/alerts/:id', alertController.deleteAlert);

// Get alert history for a specific alert
router.get('/alerts/:id/history', alertController.getAlertHistory);

// Manually test an alert
router.post('/alerts/:id/test', alertController.testAlert);

// Get alert statistics
router.get('/alerts/stats', alertController.getAlertStats);

module.exports = router;