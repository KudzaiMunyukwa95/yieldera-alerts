
const db = require('./database');
const nodemailer = require('nodemailer');
const { getProvider } = require('./weatherProviders/providerFactory');

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

async function sendEmailNotification(alert, message) {
  const recipients = alert.notification_emails?.split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients || !recipients.length) return;
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
    to: recipients.join(','),
    subject: `ALERT: ${alert.name || alert.alert_type.toUpperCase()} condition met`,
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

function isConditionMet(value, condition, threshold) {
  switch (condition) {
    case 'greater_than': return value > threshold;
    case 'less_than': return value < threshold;
    case 'equal_to': return value === threshold;
    default: return false;
  }
}

async function checkAlerts() {
  try {
    const [alerts] = await db.query('SELECT * FROM alerts WHERE active = 1');
    const weatherProvider = getProvider('open-meteo');
    for (const alert of alerts) {
      const [fieldRows] = await db.query('SELECT * FROM fields WHERE id = ?', [alert.field_id]);
      const field = fieldRows[0];
      if (!field || !field.latitude || !field.longitude) {
        console.warn(`⚠️ Field ${alert.field_id} missing lat/lon, skipping.`);
        continue;
      }

      console.log(`🌐 Fetching weather for field #${field.id} (${field.latitude}, ${field.longitude})`);
      const weather = await weatherProvider.fetchCurrentWeather(field.latitude, field.longitude);
      const value = weather?.[alert.alert_type];

      console.log(`🔍 Alert #${alert.id} - Type: ${alert.alert_type}, Condition: ${alert.condition_type} ${alert.threshold_value}`);
      console.log(`→ Current value: ${value}`);

      if (value === undefined || value === null) {
        console.warn(`⚠️ No data returned for alert type "${alert.alert_type}" — skipping alert #${alert.id}`);
        continue;
      }

      if (isConditionMet(value, alert.condition_type, alert.threshold_value)) {
        console.log(`🚨 Condition met for alert #${alert.id} → sending email`);
        const msg = `🌦 Alert\nField: ${field.id}\n${alert.alert_type}: ${value} (${alert.condition_type} ${alert.threshold_value})`;
        await sendEmailNotification(alert, msg);
      } else {
        console.log(`ℹ️ Condition not met for alert #${alert.id}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in alert monitor:', err.message);
  }
}

setInterval(checkAlerts, 1000 * 60 * 30);
checkAlerts();
