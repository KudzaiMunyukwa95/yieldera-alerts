// alertController.js

const db = require('./database');
const nodemailer = require('nodemailer');

// Setup email transport
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// GET /alerts
const getAllAlerts = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alerts ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching alerts', error: err.message });
  }
};

// GET /alerts/:id
const getAlertById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching alert', error: err.message });
  }
};

// POST /alerts
const createAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active = 1 } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO alerts (field_id, alert_type, condition_type, threshold_value, notification_emails, active) VALUES (?, ?, ?, ?, ?, ?)',
      [field_id, alert_type, condition_type, threshold_value, notification_emails, active]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error creating alert', error: err.message });
  }
};

// PUT /alerts/:id
const updateAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE alerts SET field_id = ?, alert_type = ?, condition_type = ?, threshold_value = ?, notification_emails = ?, active = ? WHERE id = ?',
      [field_id, alert_type, condition_type, threshold_value, notification_emails, active, req.params.id]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating alert', error: err.message });
  }
};

// DELETE /alerts/:id
const deleteAlert = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [req.params.id]);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting alert', error: err.message });
  }
};

// POST /alerts/:id/test
const testAlert = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    const alert = rows[0];
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const { testMessage = 'This is a test alert.', testRecipients, sendToAll } = req.body;

    const recipients = sendToAll
      ? alert.notification_emails.split(',').map(email => email.trim())
      : testRecipients.split(',').map(email => email.trim());

    const mailOptions = {
      from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject: `TEST: ${alert.name || alert.alert_type.toUpperCase()} alert`,
      text: testMessage,
      html: testMessage.replace(/\n/g, '<br>')
    };

    const info = await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Test email sent', info });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error sending test alert', error: error.message });
  }
};

// GET /alerts/:id/history (placeholder)
const getAlertHistory = (req, res) => {
  res.json({ message: 'Alert history not yet implemented' });
};

// GET /alerts/stats (placeholder)
const getAlertStats = (req, res) => {
  res.json({ message: 'Alert stats not yet implemented' });
};

module.exports = {
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  testAlert,
  getAlertHistory,
  getAlertStats
};
