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

// 🔔 POST /alerts/:id/test — Send test email
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    const alert = rows[0];

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const { testMessage = '🚨 This is a test alert.', testRecipients, sendToAll } = req.body;

    const recipients = sendToAll
      ? alert.notification_emails.split(',').map(e => e.trim()).filter(Boolean)
      : testRecipients.split(',').map(e => e.trim()).filter(Boolean);

    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'No valid recipients provided' });
    }

    const mailOptions = {
      from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject: `TEST: ${alert.alert_type.toUpperCase()} alert for Field #${alert.field_id}`,
      text: testMessage,
      html: testMessage.replace(/\n/g, '<br>')
    };

    const info = await emailTransporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: '✅ Test email sent successfully', info });
  } catch (err) {
    console.error('❌ Error in testAlert:', err);
    res.status(500).json({ success: false, message: 'Server error during test alert', error: err.message });
  }
};

// 🌾 GET all alerts
const getAllAlerts = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM alerts ORDER BY id DESC');
  res.json(rows);
};

// 🌾 GET one alert
const getAlertById = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Alert not found' });
  res.json(rows[0]);
};

// 🌾 CREATE alert
const createAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active = 1 } = req.body;
  const [result] = await db.query(
    'INSERT INTO alerts (field_id, alert_type, condition_type, threshold_value, notification_emails, active) VALUES (?, ?, ?, ?, ?, ?)',
    [field_id, alert_type, condition_type, threshold_value, notification_emails, active]
  );
  res.status(201).json({ success: true, id: result.insertId });
};

// 🌾 UPDATE alert
const updateAlert = async (req, res) => {
  const { field_id, alert_type, condition_type, threshold_value, notification_emails, active } = req.body;
  const [result] = await db.query(
    'UPDATE alerts SET field_id = ?, alert_type = ?, condition_type = ?, threshold_value = ?, notification_emails = ?, active = ? WHERE id = ?',
    [field_id, alert_type, condition_type, threshold_value, notification_emails, active, req.params.id]
  );
  res.json({ success: true, affectedRows: result.affectedRows });
};

// 🌾 DELETE alert
const deleteAlert = async (req, res) => {
  const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [req.params.id]);
  res.json({ success: true, affectedRows: result.affectedRows });
};

// 🌾 Placeholder for history and stats
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
