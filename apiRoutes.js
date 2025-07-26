const express = require('express');
const router = express.Router();
const alertController = require('./alertController');
const db = require('./database');

// 🌾 FIELD ROUTES
router.get('/fields', async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    let query = 'SELECT * FROM fields';
    let params = [];

    // Add search functionality if a search term is provided
    if (searchTerm && searchTerm.length >= 3) {
      query += ' WHERE name LIKE ? OR farmer_name LIKE ? OR crop LIKE ?';
      const searchParam = `%${searchTerm}%`;
      params = [searchParam, searchParam, searchParam];
    }

    query += ' ORDER BY id DESC';
    
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch fields', error: err.message });
  }
});

// Get field by ID with more details
router.get('/fields/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fields WHERE id = ?', [req.params.id]);
    
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Field not found' });
    }
    
    // Get active alerts for this field
    const [alerts] = await db.query(
      'SELECT * FROM alerts WHERE field_id = ? AND active = 1', 
      [req.params.id]
    );
    
    // Add alerts to the field data
    const fieldWithAlerts = { 
      ...rows[0],
      alerts: alerts || []
    };
    
    res.json(fieldWithAlerts);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch field', error: err.message });
  }
});

// 🚨 ALERT ROUTES (using the updated controller)
router.get('/alerts', alertController.getAllAlerts);
router.get('/alerts/triggered-history', alertController.getTriggeredAlertsHistory); // NEW ROUTE - Must be before /:id route
router.get('/alerts/:id', alertController.getAlertById);
router.post('/alerts', alertController.createAlert);
router.put('/alerts/:id', alertController.updateAlert);
router.delete('/alerts/:id', alertController.deleteAlert);
router.post('/alerts/:id/test', alertController.testAlert);

module.exports = router;
