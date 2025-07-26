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
    
    // Update last triggered time and trigger count
    await db.query(
      'UPDATE alerts SET last_triggered = NOW(), trigger_count = trigger_count + 1 WHERE id = ?',
      [alert.id]
    );
    
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// Check if the alert condition is met
function isConditionMet(value, condition, threshold) {
  const val = parseFloat(value);
  const thresh = parseFloat(threshold);
  
  switch (condition) {
    case 'greater_than': return val > thresh;
    case 'less_than': return val < thresh;
    case 'equal_to': return Math.abs(val - thresh) < 0.1; // Small tolerance for floating point
    default: return false;
  }
}

// Fetch weather data from Open-Meteo
async function fetchWeatherData(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.current_weather) {
      throw new Error('No current weather data available');
    }
    
    const currentWeather = data.current_weather;
    
    return {
      temperature: currentWeather.temperature,
      windspeed: currentWeather.windspeed,
      // Rainfall estimation based on weather code (simplified)
      rainfall: (currentWeather.weathercode >= 50 && currentWeather.weathercode < 70) ? 
               (currentWeather.weathercode - 49) * 0.1 : 0
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

// Core alert checking function
async function checkAlerts() {
  try {
    console.log('🔍 Starting alert check cycle...');
    
    // Get all active alerts with field information
    const [alerts] = await db.query(`
      SELECT 
        a.*,
        COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name,
        f.latitude,
        f.longitude
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      WHERE a.active = 1 AND f.latitude IS NOT NULL AND f.longitude IS NOT NULL
    `);
    
    if (!alerts.length) {
      console.log('ℹ️ No active alerts with valid field coordinates found');
      return;
    }
    
    console.log(`📋 Found ${alerts.length} active alerts to check`);
    
    // Group alerts by coordinates to minimize API calls
    const locationGroups = {};
    alerts.forEach(alert => {
      const key = `${alert.latitude}_${alert.longitude}`;
      if (!locationGroups[key]) {
        locationGroups[key] = {
          latitude: alert.latitude,
          longitude: alert.longitude,
          fieldInfo: {
            name: alert.field_name,
            id: alert.field_id
          },
          alerts: []
        };
      }
      locationGroups[key].alerts.push(alert);
    });
    
    console.log(`🌍 Processing ${Object.keys(locationGroups).length} unique locations`);
    
    // Check each location group
    for (const [coordKey, group] of Object.entries(locationGroups)) {
      try {
        const weather = await fetchWeatherData(group.latitude, group.longitude);
        
        if (!weather) {
          console.warn(`⚠️ Could not fetch weather for ${group.fieldInfo.name}`);
          continue;
        }
        
        console.log(`🌤️ Weather for ${group.fieldInfo.name}: ${weather.temperature}°C, ${weather.windspeed}km/h, ${weather.rainfall}mm`);
        
        // Check each alert for this location
        for (const alert of group.alerts) {
          const weatherValue = weather[alert.alert_type];
          
          if (weatherValue !== null && weatherValue !== undefined) {
            const threshold = parseFloat(alert.threshold_value);
            
            if (isConditionMet(weatherValue, alert.condition_type, threshold)) {
              console.log(`🚨 ALERT TRIGGERED: ${alert.alert_type} ${alert.condition_type} ${threshold} (actual: ${weatherValue}) for ${group.fieldInfo.name}`);
              
              // Check notification frequency to avoid spam
              let shouldSend = true;
              
              if (alert.last_triggered && alert.notification_frequency !== 'once') {
                const lastTriggered = new Date(alert.last_triggered);
                const now = new Date();
                const hoursDiff = (now - lastTriggered) / (1000 * 60 * 60);
                
                if (alert.notification_frequency === 'hourly' && hoursDiff < 1) {
                  shouldSend = false;
                } else if (alert.notification_frequency === 'daily' && hoursDiff < 24) {
                  shouldSend = false;
                }
              }
              
              if (shouldSend) {
                await sendEmailNotification(alert, group.fieldInfo, weatherValue);
              } else {
                console.log(`⏭️ Skipping notification for alert ${alert.id} due to frequency limit`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing location ${coordKey}:`, error);
        continue;
      }
    }
    
    console.log('✅ Alert check cycle completed');
    
  } catch (err) {
    console.error('❌ Alert monitor error:', err);
  }
}

// Run immediately and then every 30 minutes
console.log('🚀 Starting Alert Monitor Service...');
checkAlerts();

// Set up interval for regular checks
const INTERVAL_MINUTES = 30;
setInterval(checkAlerts, INTERVAL_MINUTES * 60 * 1000);

console.log(`⏰ Alert monitoring active - checking every ${INTERVAL_MINUTES} minutes`);

module.exports = {
  checkAlerts,
  sendEmailNotification,
  isConditionMet
};
