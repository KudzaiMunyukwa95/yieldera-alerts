const db = require('./database');
const nodemailer = require('nodemailer');

// Email config
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// 🚨 TEST ALERT
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    const alert = rows[0];
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });

    const { testMessage = '🚨 This is a test alert.', testRecipients, sendToAll } = req.body;
    const recipients = sendToAll
      ? alert.notification_emails.split(',').map(e => e.trim())
      : testRecipients.split(',').map(e => e.trim());

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
    res.status(500).json({ success: false, message: 'Test alert failed', error: err.message });
  }
};

// ✅ CREATE ALERT
const createAlert = async (req, res) => {
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    active = 1
  } = req.body;

  try {
    const [result] = await db.query(
      `INSERT INTO alerts (field_id, alert_type, condition_type, threshold_value, duration_hours, notification_emails, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [field_id, alert_type, condition_type, threshold_value, duration_hours, notification_emails, active]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('❌ Error inserting alert:', err);
    res.status(500).json({ success: false, message: 'Insert failed', error: err.message });
  }
};

// ✅ UPDATE ALERT
const updateAlert = async (req, res) => {
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    active
  } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE alerts SET field_id = ?, alert_type = ?, condition_type = ?, threshold_value = ?, duration_hours = ?, notification_emails = ?, active = ?
       WHERE id = ?`,
      [field_id, alert_type, condition_type, threshold_value, duration_hours, notification_emails, active, req.params.id]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('❌ Error updating alert:', err);
    res.status(500).json({ success: false, message: 'Update failed', error: err.message });
  }
};

// ✅ GET ALL ALERTS
const getAllAlerts = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alerts ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching alerts:', err);
    res.status(500).json({ success: false, message: 'Fetch failed', error: err.message });
  }
};

// ✅ GET SINGLE ALERT
const getAlertById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error fetching alert by ID:', err);
    res.status(500).json({ success: false, message: 'Fetch by ID failed', error: err.message });
  }
};

// ✅ DELETE ALERT
const deleteAlert = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [req.params.id]);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('❌ Error deleting alert:', err);
    res.status(500).json({ success: false, message: 'Delete failed', error: err.message });
  }
};

// Optional placeholders
const getAlertHistory = (req, res) => res.json({ message: 'Alert history not implemented yet.' });
const getAlertStats = (req, res) => res.json({ message: 'Alert stats not implemented yet.' });

// ✅ EXPORT
module.exports = {
  testAlert,
  createAlert,
  updateAlert,
  getAllAlerts,
  getAlertById,
  deleteAlert,
  getAlertHistory,
  getAlertStats
};
