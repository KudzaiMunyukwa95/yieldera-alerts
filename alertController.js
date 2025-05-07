// alertController.js - Controller for alert-related API endpoints

const express = require('express');
const db = require('./database');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Configure email transport
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Configure SMS client (Twilio)
const twilioClient = process.env.TWILIO_ENABLED === 'true'
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Express router setup
const router = express.Router();

// Dummy in-memory store (replace with DB logic as needed)
const alerts = [
  {
    id: 1,
    name: 'Test Alert',
    field_id: 1,
    alert_type: 'temperature',
    condition_type: 'greaterThan',
    threshold_value: 30,
    duration_hours: 1,
    email_notification: true,
    notification_emails: 'your@email.com',
    sms_notification: false,
    phone_numbers: '',
    notification_frequency: 'once'
  }
];

// GET all alerts
router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM alerts');
  res.json({ success: true, data: result });
});

// GET alert by ID
router.get('/:id', async (req, res) => {
  const alert = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
  if (!alert.length) return res.status(404).json({ success: false, message: 'Alert not found' });
  res.json({ success: true, data: alert[0] });
});

// POST new alert
router.post('/', async (req, res) => {
  const alert = req.body;
  const result = await db.query('INSERT INTO alerts SET ?', alert);
  const inserted = await db.query('SELECT * FROM alerts WHERE id = ?', [result.insertId]);
  res.status(201).json({ success: true, data: inserted[0] });
});

// POST test alert
router.post('/:id/test', async (req, res) => {
  const alert = await db.query('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
  if (!alert.length) return res.status(404).json({ success: false, message: 'Alert not found' });

  const { testMessage, testRecipients, sendToAll } = req.body;
  const recipients = sendToAll
    ? alert[0].notification_emails.split(',').map(email => email.trim())
    : testRecipients.split(',').map(email => email.trim());

  try {
    await sendEmailNotification(recipients, `TEST: ${alert[0].name}`, testMessage || 'This is a test message.');
    res.json({ success: true, message: 'Test email sent successfully.' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email.', error: error.message });
  }
});

// Send email utility
async function sendEmailNotification(recipients, subject, message) {
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
    subject: subject,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };
  const info = await emailTransporter.sendMail(mailOptions);
  console.log(`Email sent: ${info.messageId}`);
  return info;
}

module.exports = router;
