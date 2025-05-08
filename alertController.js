// alertController.js

const db = require('./database'); // Keep DB for other routes
const nodemailer = require('nodemailer'); // Keep email logic ready

// TEMPORARY TEST ALERT ROUTE (debug only)
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    const { testMessage, testRecipients, sendToAll } = req.body;

    console.log("✅ Reached testAlert route.");
    console.log("Received payload:", { testMessage, testRecipients, sendToAll });

    res.status(200).json({
      success: true,
      message: `Test alert route working!`,
      received: { alertId, testMessage, testRecipients, sendToAll }
    });
  } catch (err) {
    console.error('❌ Error in testAlert:', err);
    res.status(500).json({ success: false, message: 'Unexpected server error', error: err.message });
  }
};

// You can still export these for the full API (don't remove them!)
const getAllAlerts = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM alerts ORDER BY id DESC');
  res.json(rows);
};

const getAlertById = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Alert not found' });
  res.json(rows[0]);
};

const createAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active = 1 } = req.body;
  const [result] = await db.query(
    'INSERT INTO alerts (field_id, alert_type, condition_type, threshold_value, notification_emails, active) VALUES (?, ?, ?, ?, ?, ?)',
    [field_id, alert_type, condition_type, threshold_value, notification_emails, active]
  );
  res.status(201).json({ success: true, id: result.insertId });
};

const updateAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active } = req.body;
  const [result] = await db.query(
    'UPDATE alerts SET field_id = ?, alert_type = ?, condition_type = ?, threshold_value = ?, notification_emails = ?, active = ? WHERE id = ?',
    [field_id, alert_type, condition_type, threshold_value, notification_emails, active, req.params.id]
  );
  res.json({ success: true, affectedRows: result.affectedRows });
};

const deleteAlert = async (req, res) => {
  const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [req.params.id]);
  res.json({ success: true, affectedRows: result.affectedRows });
};

const getAlertHistory = (req, res) => {
  res.json({ message: 'Alert history not implemented yet.' });
};

const getAlertStats = (req, res) => {
  res.json({ message: 'Alert stats not implemented yet.' });
};

module.exports = {
  testAlert,
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  getAlertHistory,
  getAlertStats
};
