const db = require('./database');
const nodemailer = require('nodemailer');
const { getProvider } = require('./weatherProviders/providerFactory');

// Email setup with connection pooling for better performance
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  pool: true, // Enable connection pooling
  maxConnections: 5, // Limit concurrent connections
  maxMessages: 100, // Messages per connection
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Cache for better performance
const monitorCache = {
  fields: new Map(),
  lastFieldUpdate: 0,
  alertCooldowns: new Map(), // Prevent spam alerts
  FIELD_CACHE_DURATION: 10 * 60 * 1000, // 10 minutes
  ALERT_COOLDOWN: 30 * 60 * 1000 // 30 minutes between same alerts
};

// Initialize weather provider with error handling
let weatherProvider;
try {
  weatherProvider = getProvider('open-meteo');
} catch (error) {
  console.error('❌ Failed to initialize weather provider:', error);
  process.exit(1);
}

// Update fields cache for performance
async function updateFieldsCache() {
  try {
    const now = Date.now();
    if (now - monitorCache.lastFieldUpdate < monitorCache.FIELD_CACHE_DURATION && monitorCache.fields.size > 0) {
      return; // Cache is still valid
    }

    const [fields] = await db.query(`
      SELECT id, name, latitude, longitude, farm_name, farmer_name 
      FROM fields 
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    `);
    
    monitorCache.fields.clear();
    fields.forEach(field => {
      monitorCache.fields.set(field.id, field);
    });
    
    monitorCache.lastFieldUpdate = now;
    console.log(`✅ Updated fields cache with ${fields.length} fields`);
  } catch (error) {
    console.error('❌ Error updating fields cache:', error);
  }
}

// Enhanced email notification with better formatting and error handling
async function sendEmailNotification(alert, field, weatherValue, currentWeather = null) {
  try {
    const recipients = alert.notification_emails?.split(',').map(e => e.trim()).filter(Boolean);
    if (!recipients || !recipients.length) {
      console.warn(`⚠️ No valid recipients for alert ${alert.id}`);
      return false;
    }

    // Check cooldown to prevent spam
    const alertKey = `${alert.id}-${alert.field_id}`;
    const lastSent = monitorCache.alertCooldowns.get(alertKey);
    const now = Date.now();
    
    if (lastSent && (now - lastSent) < monitorCache.ALERT_COOLDOWN) {
      console.log(`⏰ Alert ${alert.id} in cooldown period`);
      return false;
    }

    const conditionSymbols = {
      greater_than: '&gt;',
      less_than: '&lt;',
      equal_to: '='
    };
    
    const units = {
      temperature: '°C',
      windspeed: 'km/h', 
      rainfall: 'mm',
      ndvi: ''
    };

    const symbol = conditionSymbols[alert.condition_type] || '?';
    const unit = units[alert.alert_type] || '';
    
    // Get alert type name with proper capitalization
    const alertTypeName = alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1);
    
    // Get emoji for alert type
    const alertEmoji = {
      temperature: '🌡️',
      windspeed: '💨',
      rainfall: '🌧️',
      ndvi: '🌱'
    }[alert.alert_type] || '⚠️';

    // Enhanced field information
    const fieldName = field.name || `Field #${field.id}`;
    const farmInfo = field.farm_name ? ` (${field.farm_name})` : '';
    const farmerInfo = field.farmer_name ? ` - ${field.farmer_name}` : '';

    // Additional weather context if available
    let weatherContext = '';
    if (currentWeather) {
      weatherContext = `
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0; color: #01282F;">Current Weather Conditions</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
            ${currentWeather.temperature !== undefined ? `
              <div style="text-align: center; padding: 8px; background: white; border-radius: 4px;">
                <div style="font-size: 12px; color: #666;">Temperature</div>
                <div style="font-weight: bold; color: #01282F;">${currentWeather.temperature.toFixed(1)}°C</div>
              </div>
            ` : ''}
            ${currentWeather.windspeed !== undefined ? `
              <div style="text-align: center; padding: 8px; background: white; border-radius: 4px;">
                <div style="font-size: 12px; color: #666;">Wind Speed</div>
                <div style="font-weight: bold; color: #01282F;">${currentWeather.windspeed.toFixed(1)} km/h</div>
              </div>
            ` : ''}
            ${currentWeather.rainfall !== undefined ? `
              <div style="text-align: center; padding: 8px; background: white; border-radius: 4px;">
                <div style="font-size: 12px; color: #666;">Rainfall</div>
                <div style="font-weight: bold; color: #01282F;">${currentWeather.rainfall.toFixed(1)} mm</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

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
                  background: linear-gradient(135deg, #01282F 0%, #023a45 100%);
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
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                  color: white;
                  font-weight: 600;
                  padding: 8px 15px;
                  border-radius: 6px;
                  margin-bottom: 10px;
                  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
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
                  padding: 20px;
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
                  margin-bottom: 12px;
                  display: flex;
                  align-items: center;
              }
              .detail-label {
                  font-weight: 600;
                  display: inline-block;
                  min-width: 150px;
                  color: #374151;
              }
              .value-display {
                  font-family: 'Courier New', monospace;
                  font-weight: 700;
                  background-color: #E5E7EB;
                  padding: 4px 8px;
                  border-radius: 4px;
                  color: #01282F;
              }
              .threshold-exceeded {
                  background-color: #FEE2E2;
                  color: #DC2626;
                  font-weight: 700;
                  padding: 4px 8px;
                  border-radius: 4px;
              }
              .footer {
                  text-align: center;
                  padding: 25px;
                  color: #8b9198;
                  font-size: 14px;
                  border-top: 1px solid #e5e7eb;
                  background-color: #f9fafb;
                  border-bottom-left-radius: 8px;
                  border-bottom-right-radius: 8px;
              }
              .timestamp {
                  font-size: 12px;
                  color: #9CA3AF;
                  margin-top: 10px;
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
                      A weather alert has been triggered for one of your monitored fields. Please review the details below and take appropriate action if necessary.
                  </div>
                  
                  <div class="alert-details">
                      <h3>Alert Details</h3>
                      <div class="detail-item">
                          <span class="detail-label">Field:</span> 
                          <span><strong>${fieldName}${farmInfo}${farmerInfo}</strong></span>
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
                          <span class="threshold-exceeded">Threshold condition met</span>
                      </div>
                      <div class="timestamp">
                          Alert triggered at: ${new Date().toLocaleString()}
                      </div>
                  </div>
                  
                  ${weatherContext}
                  
                  <div class="message">
                      You're receiving this alert because you're subscribed to weather notifications for this field. 
                      To manage your alert settings, please log in to your Yieldera dashboard.
                  </div>
              </div>
              <div class="footer">
                  <div>Best regards,</div>
                  <div style="font-weight: 600; color: #01282F; margin-top: 5px;">The Yieldera Team</div>
                  <div style="margin-top: 15px;">© ${new Date().getFullYear()} Yieldera. All rights reserved.</div>
                  <div style="margin-top: 5px; font-size: 12px;">
                      This is an automated message from the Yieldera Weather Alert System
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: '"Yieldera Weather Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject: `🚨 ALERT: ${alertTypeName} threshold exceeded - ${fieldName}`,
      html: message,
      // Add text version for better compatibility
      text: `
YIELDERA WEATHER ALERT

Alert triggered for ${fieldName}${farmInfo}${farmerInfo}

Alert Type: ${alertTypeName}
Current Value: ${weatherValue}${unit}
Threshold: ${symbol} ${alert.threshold_value}${unit}
Status: Threshold condition met

Time: ${new Date().toLocaleString()}

You're receiving this alert because you're subscribed to weather notifications for this field.
To manage your alert settings, please log in to your Yieldera dashboard.

© ${new Date().getFullYear()} Yieldera. All rights reserved.
      `.trim()
    };

    const info = await emailTransporter.sendMail(mailOptions);
    
    // Update cooldown cache
    monitorCache.alertCooldowns.set(alertKey, now);
    
    // Update last triggered in database
    await db.query('UPDATE alerts SET last_triggered = NOW() WHERE id = ?', [alert.id]);
    
    console.log(`✅ Alert sent to ${recipients.join(', ')} for field ${fieldName} (Alert ID: ${alert.id})`);
    return true;
    
  } catch (err) {
    console.error(`❌ Email failed for alert ${alert.id}:`, err.message);
    return false;
  }
}

// Check if the alert condition is met with enhanced logic
function isConditionMet(value, condition, threshold, tolerance = 0.1) {
  if (value === null || value === undefined || isNaN(value)) {
    return false;
  }
  
  switch (condition) {
    case 'greater_than': 
      return value > threshold;
    case 'less_than': 
      return value < threshold;
    case 'equal_to': 
      // Use tolerance for floating point comparison
      return Math.abs(value - threshold) <= tolerance;
    default: 
      return false;
  }
}

// Enhanced alert checking with better error handling and performance
async function checkAlerts() {
  const startTime = Date.now();
  console.log(`🔍 Starting alert check at ${new Date().toISOString()}`);
  
  try {
    // Update fields cache
    await updateFieldsCache();
    
    // Get all active alerts with field information
    const [alerts] = await db.query(`
      SELECT 
        a.*,
        f.name as field_name,
        f.latitude,
        f.longitude,
        f.farm_name,
        f.farmer_name
      FROM alerts a
      INNER JOIN fields f ON a.field_id = f.id
      WHERE a.active = 1 
        AND f.latitude IS NOT NULL 
        AND f.longitude IS NOT NULL
      ORDER BY a.id
    `);

    if (alerts.length === 0) {
      console.log('ℹ️ No active alerts to check');
      return;
    }

    console.log(`📋 Checking ${alerts.length} active alerts`);
    
    let alertsTriggered = 0;
    let alertsProcessed = 0;
    const errors = [];

    // Process alerts in batches to avoid overwhelming the weather API
    const BATCH_SIZE = 10;
    for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
      const batch = alerts.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (alert) => {
        try {
          alertsProcessed++;
          
          // Get weather data for this field
          const weather = await weatherProvider.fetchCurrentWeather(
            alert.latitude, 
            alert.longitude
          );
          
          if (!weather || !weather[alert.alert_type]) {
            console.warn(`⚠️ No ${alert.alert_type} data for field ${alert.field_name} (ID: ${alert.field_id})`);
            return;
          }

          const weatherValue = weather[alert.alert_type];
          const threshold = parseFloat(alert.threshold_value);
          const condition = alert.condition_type;

          // Check if condition is met
          if (isConditionMet(weatherValue, condition, threshold)) {
            console.log(`🚨 Alert triggered: ${alert.alert_type} ${weatherValue} ${condition} ${threshold} for field ${alert.field_name}`);
            
            const emailSent = await sendEmailNotification(alert, {
              id: alert.field_id,
              name: alert.field_name,
              farm_name: alert.farm_name,
              farmer_name: alert.farmer_name
            }, weatherValue, weather);
            
            if (emailSent) {
              alertsTriggered++;
            }
          } else {
            console.log(`✅ Alert OK: ${alert.alert_type} ${weatherValue} (threshold: ${condition} ${threshold}) for field ${alert.field_name}`);
          }
          
        } catch (error) {
          console.error(`❌ Error processing alert ${alert.id}:`, error.message);
          errors.push({ alertId: alert.id, error: error.message });
        }
      }));
      
      // Small delay between batches to be respectful to the weather API
      if (i + BATCH_SIZE < alerts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Alert check completed in ${duration}ms`);
    console.log(`📊 Summary: ${alertsProcessed} alerts processed, ${alertsTriggered} alerts triggered`);
    
    if (errors.length > 0) {
      console.log(`⚠️ Errors encountered: ${errors.length}`);
      errors.forEach(({ alertId, error }) => {
        console.log(`   Alert ${alertId}: ${error}`);
      });
    }
    
  } catch (err) {
    console.error('❌ Alert monitor error:', err.message);
    console.error(err.stack);
  }
}

// Cleanup old cooldown entries periodically
function cleanupCooldowns() {
  const now = Date.now();
  const cutoff = now - monitorCache.ALERT_COOLDOWN;
  
  for (const [key, timestamp] of monitorCache.alertCooldowns.entries()) {
    if (timestamp < cutoff) {
      monitorCache.alertCooldowns.delete(key);
    }
  }
  
  console.log(`🧹 Cleaned up cooldown cache, ${monitorCache.alertCooldowns.size} entries remaining`);
}

// Graceful shutdown handling
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close email transporter
      if (emailTransporter) {
        emailTransporter.close();
        console.log('✅ Email transporter closed');
      }
      
      // Close database connections if needed
      if (db && typeof db.end === 'function') {
        await db.end();
        console.log('✅ Database connections closed');
      }
      
      console.log('👋 Alert monitor shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Initialize monitoring
function initializeMonitoring() {
  console.log('🚀 Starting Yieldera Alert Monitor');
  console.log(`📧 Email configured: ${process.env.SMTP_USER ? 'Yes' : 'No'}`);
  console.log(`🌤️ Weather provider: ${weatherProvider.constructor.name}`);
  
  // Setup graceful shutdown
  setupGracefulShutdown();
  
  // Run initial check
  checkAlerts();
  
  // Schedule regular checks every 30 minutes
  const INTERVAL = 30 * 60 * 1000; // 30 minutes
  setInterval(checkAlerts, INTERVAL);
  console.log(`⏰ Scheduled checks every ${INTERVAL / 60000} minutes`);
  
  // Cleanup cooldowns every hour
  setInterval(cleanupCooldowns, 60 * 60 * 1000);
  
  // Health check log every 6 hours
  setInterval(() => {
    console.log(`💚 Alert monitor healthy - ${new Date().toISOString()}`);
    console.log(`📊 Cache stats: ${monitorCache.fields.size} fields, ${monitorCache.alertCooldowns.size} cooldowns`);
  }, 6 * 60 * 60 * 1000);
}

// Start the monitoring if this file is run directly
if (require.main === module) {
  initializeMonitoring();
}

module.exports = {
  checkAlerts,
  initializeMonitoring,
  isConditionMet,
  sendEmailNotification
};
