const db = require('./database');
const nodemailer = require('nodemailer');
const { getProvider } = require('./weatherProviders/providerFactory');

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

// Send formatted alert email
async function sendEmailNotification(alert, field, weatherValue) {
  const recipients = alert.notification_emails?.split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients || !recipients.length) return;

  const conditionSymbols = {
    greater_than: '&gt;',
    less_than: '&lt;',
    equal_to: '='
  };
  const units = {
    temperature: '°C',
    windspeed: 'km/h',
    rainfall: 'mm'
  };

  const symbol = conditionSymbols[alert.condition_type] || '?';
  const unit = units[alert.alert_type] || '';
  
  // Get alert type name with proper capitalization
  const alertTypeName = alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1);
  
  // Get emoji for alert type
  const alertEmoji = {
    temperature: '🌡️',
    windspeed: '💨',
    rainfall: '🌧️'
  }[alert.alert_type] || '⚠️';

  const message = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Weather Alert - Yieldera</title>
        <style>
            body {
                font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f8f9fa;
                color: #01282F;
                line-height: 1.6;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 0;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            }
            .header {
                background-color: #01282F;
                padding: 25px 20px;
                text-align: center;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
            }
            .header-text {
                color: #B6BF00;
                font-size: 32px;
                font-weight: bold;
                margin: 0;
                letter-spacing: 1px;
                text-transform: uppercase;
            }
            .content {
                padding: 30px 25px;
            }
            .alert-badge {
                display: inline-block;
                background-color: #ef4444;
                color: white;
                font-weight: 600;
                padding: 5px 10px;
                border-radius: 4px;
                margin-bottom: 5px;
            }
            .greeting {
                font-size: 24px;
                font-weight: 600;
                margin-bottom: 20px;
                color: #01282F;
            }
            .message {
                font-size: 16px;
                margin-bottom: 25px;
                line-height: 1.7;
            }
            .alert-details {
                background-color: #f8f9fa;
                border-left: 4px solid #B6BF00;
                padding: 15px 20px;
                margin-bottom: 25px;
                border-radius: 4px;
            }
            .alert-details h3 {
                margin-top: 0;
                margin-bottom: 15px;
                color: #01282F;
                font-size: 18px;
            }
            .detail-item {
                margin-bottom: 10px;
            }
            .detail-label {
                font-weight: 600;
                display: inline-block;
                width: 150px;
            }
            .value-display {
                font-family: monospace;
                font-weight: 700;
                background-color: #E5E7EB;
                padding: 2px 6px;
                border-radius: 3px;
            }
            .footer {
                text-align: center;
                padding: 20px 25px;
                color: #8b9198;
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-text">YIELDERA</div>
            </div>
            <div class="content">
                <div class="alert-badge">${alertEmoji} ALERT TRIGGERED</div>
                <div class="greeting">Weather Alert Notification</div>
                
                <div class="message">
                    A weather alert has been triggered for one of your monitored fields. Please review the details below.
                </div>
                
                <div class="alert-details">
                    <h3>Alert Details</h3>
                    <div class="detail-item">
                        <span class="detail-label">Field:</span> 
                        <span>${field.name || `#${field.id}`}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Alert Type:</span> 
                        <span>${alertTypeName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Current Value:</span> 
                        <span class="value-display">${weatherValue}${unit}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Threshold:</span> 
                        <span>${symbol} ${alert.threshold_value}${unit}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Status:</span> 
                        <span style="color: #ef4444; font-weight: 600;">Threshold condition met</span>
                    </div>
                </div>
                
                <div class="message">
                    You're receiving this alert because you're subscribed to weather notifications for this field. 
                    To manage your alert settings, please log in to your Yieldera dashboard.
                </div>
            </div>
            <div class="footer">
                <div>Regards,</div>
                <div style="font-weight: 600; color: #01282F; margin-top: 5px;">The Yieldera Team</div>
                <div style="margin-top: 15px;">© ${new Date().getFullYear()} Yieldera. All rights reserved.</div>
            </div>
        </div>
    </body>
    </html>
  `;

  try {
    const info = await emailTransporter.sendMail({
      from: '"Yieldera Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject: `ALERT: ${alert.alert_type.toUpperCase()} condition met`,
      html: message
    });
    console.log(`✅ Alert sent to ${recipients.join(', ')} for field ${field.name || field.id}`);
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// Check if the alert condition is met
function isConditionMet(value, condition, threshold) {
  switch (condition) {
    case 'greater_than': return value > threshold;
    case 'less_than': return value < threshold;
    case 'equal_to': return value === threshold;
    default: return false;
  }
}

// Core checker
async function checkAlerts() {
  try {
    const [alerts] = await db.query('SELECT * FROM alerts WHERE active = 1');
    const weatherProvider = getProvider('open-meteo');

    for (const alert of alerts) {
      const [fieldRows] = await db.query('SELECT * FROM fields WHERE id = ?', [alert.field_id]);
      const field = fieldRows[0];
      if (!field || !field.latitude || !field.longitude) continue;

      const weather = await weatherProvider.fetchCurrentWeather(field.latitude, field.longitude);
      if (!weather || !weather[alert.alert_type]) continue;

      const weatherValue = weather[alert.alert_type];
      const threshold = alert.threshold_value;
      const condition = alert.condition_type;

      if (isConditionMet(weatherValue, condition, threshold)) {
        await sendEmailNotification(alert, field, weatherValue);
      }
    }
  } catch (err) {
    console.error('❌ Alert monitor error:', err.message);
  }
}

// Run on load and every 30 minutes
checkAlerts();
setInterval(checkAlerts, 1000 * 60 * 30);
