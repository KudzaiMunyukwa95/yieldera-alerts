// alertController.js - Controller for alert-related API endpoints

const express = require('express');
const db = require('./database');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Email transport configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Twilio SMS setup
const twilioClient = process.env.TWILIO_ENABLED === 'true'
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const router = express.Router();

// ✅ GET all alerts
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM alerts');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Fetch all alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve alerts.' });
  }
});

// ✅ GET specific alert by ID
router.get('/:id', async (req, res) => {
  try {
    const alert = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    if (!alert.length) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    res.json({ success: true, data: alert[0] });
  } catch (error) {
    console.error('Fetch alert by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve alert.' });
  }
});

// ✅ CREATE a new alert
router.post('/', async (req, res) => {
  try {
    const alert = req.body;
    const result = await db.query('INSERT INTO alerts SET ?', alert);
    const inserted = await db.query('SELECT * FROM alerts WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: inserted[0] });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to create alert.' });
  }
});

// ✅ TRIGGER a test alert
router.post('/:id/test', async (req, res) => {
  try {
    const alert = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
    if (!alert.length) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const { testMessage, testRecipients, sendToAll } = req.body;
    const recipients = sendToAll
      ? alert[0].notification_emails.split(',').map(email => email.trim())
      : testRecipients.split(',').map(email => email.trim());

    await sendEmailNotification(recipients, `TEST: ${alert[0].name}`, testMessage || 'This is a test alert message.');
    res.json({ success: true, message: 'Test email sent successfully.' });

  } catch (error) {
    console.error('Test alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test alert.', error: error.message });
  }
});

// ✅ Email utility
async function sendEmailNotification(recipients, subject, message) {
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
    subject: subject,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };
  const info = await emailTransporter.sendMail(mailOptions);
  console.log(`📧 Email sent: ${info.messageId}`);
  return info;
}

module.exports = router;
