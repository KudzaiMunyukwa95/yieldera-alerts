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

// Test alert function (used by POST /alerts/:id/test)
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    const alertRows = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);

    if (!alertRows.length) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const alert = alertRows[0];
    const { testMessage, testRecipients, sendToAll } = req.body;

    const recipients = sendToAll
      ? alert.notification_emails.split(',').map(email => email.trim())
      : testRecipients.split(',').map(email => email.trim());

    const subject = `TEST: ${alert.name}`;
    const message = testMessage || `This is a test alert for ${alert.name}.`;

    const mailOptions = {
      from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject,
      text: message,
      html: message.replace(/\n/g, '<br>')
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${info.messageId}`);

    res.json({ success: true, message: 'Test email sent', info });
  } catch (error) {
    console.error('❌ Error in testAlert:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  testAlert
};
