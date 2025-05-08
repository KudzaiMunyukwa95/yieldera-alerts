const db = require('./database');
const nodemailer = require('nodemailer');

// Email setup
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// CREATE ALERT
const createAlert = async (req, res) => {
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than', // ✅ Default fallback
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

// UPDATE ALERT
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

// Other routes omitted for brevity...
