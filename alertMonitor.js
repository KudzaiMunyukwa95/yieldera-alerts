// alertMonitor.js

const db = require('./database');
const nodemailer = require('nodemailer');
const { getProvider } = require('./weatherProviders/providerFactory');

// Set up email transport
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Send email to configured recipients
async function sendEmailNotification(alert, message) {
  const recipients = alert.notification_emails?.split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients || recipients.length === 0) return;

  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: recipients.join(','),
    subject: `ALERT: ${alert.name}`,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${info.messageId}`);
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// Evaluate if the condition is true
function isConditionMet(value, condition, threshold) {
  switch (condition) {
    case 'greater_than': return value > threshold;
    case 'less_than': return value < threshold;
    case 'equal_to': return value === threshold;
    default: return false;
  }
}

// Core logic to check and trigger alerts
async function checkAlerts() {
  try {
    const [alerts] = await db.query('SELECT * FROM alerts WHERE active = 1');
    const weatherProvider = getProvider('open-meteo'); // scalable switch here

    for (const alert of alerts) {
      const [fieldRows] = await db.query('SELECT * FROM fields WHERE id = ?', [alert.field_id]);
      const field = fieldRows[0];
      if (!field || !field.location) continue;

      const coords = JSON.parse(field.location).coordinates;
      const [lon, lat] = coords;

      const weather = await weatherProvider.fetchCurrentWeather(lat, lon);
      if (!weather || !weather[alert.alert_type]) continue;

      const weatherValue = weather[alert.alert_type];
      const threshold = alert.threshold_value;
      const condition = alert.condition_type;

      if (isConditionMet(weatherValue, condition, threshold)) {
        const msg = `🌦 Weather Alert\nField: ${field.id}\n${alert.alert_type}: ${weatherValue} (${condition} ${threshold})`;
        await sendEmailNotification(alert, msg);
      }
    }
  } catch (err) {
    console.error('❌ Alert monitor error:', err.message);
  }
}

// Run every 30 mins
setInterval(checkAlerts, 1000 * 60 * 30);
checkAlerts(); // Run immediately on startup
