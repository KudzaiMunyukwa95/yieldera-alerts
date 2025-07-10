const db = require('./database');
const nodemailer = require('nodemailer');
const { getProvider } = require('./weatherProviders/providerFactory');

// Email setup with connection pooling
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  pool: true, // Enable connection pooling
  maxConnections: 3,
  maxMessages: 50,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// In-memory cache for field data and weather data
const fieldCache = new Map();
const weatherCache = new Map();
const alertCooldownCache = new Map(); // Prevent spam
const FIELD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1 hour cooldown between same alerts

// Rate limiting for weather API calls
const weatherApiLimiter = {
  calls: 0,
  lastReset: Date.now(),
  limit: 100, // Max calls per hour
  window: 60 * 60 * 1000 // 1 hour
};

function canMakeWeatherApiCall() {
  const now = Date.now();
  if (now - weatherApiLimiter.lastReset > weatherApiLimiter.window) {
    weatherApiLimiter.calls = 0;
    weatherApiLimiter.lastReset = now;
  }
  
  if (weatherApiLimiter.calls >= weatherApiLimiter.limit) {
    console.warn('⚠️ Weather API rate limit reached');
    return false;
  }
  
  weatherApiLimiter.calls++;
  return true;
}

// Normalize alert type for compatibility
function normalizeAlertType(alertType, direction = 'toWeather') {
  if (direction === 'toWeather') {
    // Convert database 'wind' to weather API 'windspeed'
    return alertType === 'wind' ? 'windspeed' : alertType;
  } else {
    // Convert weather API 'windspeed' to database 'wind'
    return alertType === 'windspeed' ? 'wind' : alertType;
  }
}

// Check if alert is in cooldown period
function isAlertInCooldown(alertId) {
  const cooldownKey = `alert_${alertId}`;
  const lastTriggered = alertCooldownCache.get(cooldownKey);
  
  if (!lastTriggered) return false;
  
  return Date.now() - lastTriggered < ALERT_COOLDOWN;
}

// Set alert cooldown
function setAlertCooldown(alertId) {
  const cooldownKey = `alert_${alertId}`;
  alertCooldownCache.set(cooldownKey, Date.now());
}

// Cached field lookup
async function getCachedField(fieldId) {
  const cacheKey = `field_${fieldId}`;
  const cached = fieldCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < FIELD_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const [rows] = await db.query('SELECT * FROM fields WHERE id = ? LIMIT 1', [fieldId]);
    const field = rows[0];
    
    if (field) {
      fieldCache.set(cacheKey, {
        data: field,
        timestamp: Date.now()
      });
    }
    
    return field;
  } catch (error) {
    console.error(`Failed to fetch field ${fieldId}:`, error);
    return null;
  }
}

// Cached weather lookup
async function getCachedWeather(latitude, longitude) {
  const cacheKey = `weather_${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
  const cached = weatherCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL) {
    return cached.data;
  }
  
  if (!canMakeWeatherApiCall()) {
    // Return cached data even if expired if we're rate limited
    return cached ? cached.data : null;
  }
  
  try {
    const weatherProvider = getProvider('open-meteo');
    const weather = await weatherProvider.fetchCurrentWeather(latitude, longitude);
    
    if (weather) {
      weatherCache.set(cacheKey, {
        data: weather,
        timestamp: Date.now()
      });
    }
    
    return weather;
  } catch (error) {
    console.error(`Failed to fetch weather for ${latitude}, ${longitude}:`, error);
    // Return cached data if available
    return cached ? cached.data : null;
  }
}

// Update alert last triggered timestamp
async function updateAlertTriggered(alertId) {
  try {
    await db.query(
      'UPDATE alerts SET last_triggered = NOW() WHERE id = ?',
      [alertId]
    );
  } catch (error) {
    console.error(`Failed to update alert ${alertId} triggered time:`, error);
  }
}

// Send formatted alert email (optimized)
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
    wind: 'km/h', // Note: using 'wind' from database
    windspeed: 'km/h',
    rainfall: 'mm'
  };

  const symbol = conditionSymbols[alert.condition_type] || '?';
  const unit = units[alert.alert_type] || '';
  
  // Get alert type name with proper capitalization
  const alertTypeName = normalizeAlertType(alert.alert_type, 'toWeather');
  const alertTypeDisplay = alertTypeName.charAt(0).toUpperCase() + alertTypeName.slice(1);
  
  // Get emoji for alert type
  const alertEmoji = {
    temperature: '🌡️',
    wind: '💨',
    windspeed: '💨',
    rainfall: '🌧️',
    ndvi: '🌱'
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
                        <span>${alertTypeDisplay}</span>
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
                    <div class="detail-item">
                        <span class="detail-label">Time:</span> 
                        <span>${new Date().toLocaleString()}</span>
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
      subject: `ALERT: ${alertTypeDisplay.toUpperCase()} condition met for ${field.name || `Field #${field.id}`}`,
      html: message
    });
    console.log(`✅ Alert sent to ${recipients.join(', ')} for field ${field.name || field.id}`);
    
    // Update last triggered timestamp
    await updateAlertTriggered(alert.id);
    
    // Set cooldown for this alert
    setAlertCooldown(alert.id);
    
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// Check if the alert condition is met
function isConditionMet(value, condition, threshold) {
  switch (condition) {
    case 'greater_than': return value > threshold;
    case 'less_than': return value < threshold;
    case 'equal_to': return Math.abs(value - threshold) < 0.1; // Allow small tolerance for float comparison
    default: return false;
  }
}

// Core checker - optimized to prevent blocking
async function checkAlerts() {
  const startTime = Date.now();
  console.log('🔍 Starting alert check...');
  
  try {
    // Fetch only active alerts with minimal data using your schema
    const [alerts] = await db.query(`
      SELECT id, field_id, alert_type, condition_type, threshold_value, notification_emails, last_triggered
      FROM alerts 
      WHERE active = 1 AND email_notification = 1
      ORDER BY id
    `);

    if (!alerts.length) {
      console.log('📋 No active alerts to check');
      return;
    }

    console.log(`📋 Checking ${alerts.length} active alerts`);

    // Process alerts in batches to avoid overwhelming the system
    const BATCH_SIZE = 10;
    let processed = 0;
    let triggered = 0;

    for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
      const batch = alerts.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (alert) => {
        try {
          // Check cooldown first
          if (isAlertInCooldown(alert.id)) {
            console.log(`⏰ Alert ${alert.id} in cooldown, skipping`);
            return false;
          }

          const field = await getCachedField(alert.field_id);
          if (!field || !field.latitude || !field.longitude) {
            console.warn(`⚠️ Skipping alert ${alert.id}: Invalid field data`);
            return false;
          }

          const weather = await getCachedWeather(field.latitude, field.longitude);
          if (!weather) {
            console.warn(`⚠️ Skipping alert ${alert.id}: No weather data available`);
            return false;
          }

          // Convert database alert type to weather property
          const weatherProperty = normalizeAlertType(alert.alert_type, 'toWeather');
          
          if (!weather[weatherProperty] && weather[weatherProperty] !== 0) {
            console.warn(`⚠️ Skipping alert ${alert.id}: No weather data for ${weatherProperty}`);
            return false;
          }

          const weatherValue = weather[weatherProperty];
          const threshold = alert.threshold_value;
          const condition = alert.condition_type;

          if (isConditionMet(weatherValue, condition, threshold)) {
            console.log(`🚨 Alert ${alert.id} triggered: ${weatherValue} ${condition} ${threshold} (${weatherProperty})`);
            
            // Send email notification (non-blocking)
            setImmediate(() => {
              sendEmailNotification(alert, field, weatherValue).catch(err => {
                console.error(`Failed to send notification for alert ${alert.id}:`, err);
              });
            });
            
            return true;
          }
          
          return false;
        } catch (error) {
          console.error(`Error processing alert ${alert.id}:`, error);
          return false;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      const batchTriggered = batchResults.filter(result => 
        result.status === 'fulfilled' && result.value === true
      ).length;
      
      processed += batch.length;
      triggered += batchTriggered;

      // Add small delay between batches to prevent overwhelming
      if (i + BATCH_SIZE < alerts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Alert check complete: ${processed} processed, ${triggered} triggered (${duration}ms)`);
    
  } catch (err) {
    console.error('❌ Alert monitor error:', err.message);
  }
}

// Cleanup old cache entries periodically
function cleanupCache() {
  const now = Date.now();
  
  // Clean field cache
  for (const [key, value] of fieldCache.entries()) {
    if (now - value.timestamp > FIELD_CACHE_TTL) {
      fieldCache.delete(key);
    }
  }
  
  // Clean weather cache
  for (const [key, value] of weatherCache.entries()) {
    if (now - value.timestamp > WEATHER_CACHE_TTL) {
      weatherCache.delete(key);
    }
  }
  
  // Clean alert cooldown cache (remove entries older than cooldown period)
  for (const [key, timestamp] of alertCooldownCache.entries()) {
    if (now - timestamp > ALERT_COOLDOWN) {
      alertCooldownCache.delete(key);
    }
  }
  
  console.log(`🧹 Cache cleanup: ${fieldCache.size} fields, ${weatherCache.size} weather, ${alertCooldownCache.size} cooldowns`);
}

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('📤 Gracefully shutting down alert monitor...');
  emailTransporter.close();
  process.exit(0);
});

// Initialize - stagger startup to avoid conflicts
setTimeout(() => {
  console.log('🚀 Alert monitor starting...');
  checkAlerts();
}, Math.random() * 30000); // Random delay up to 30 seconds

// Run every 30 minutes with some jitter to spread load
setInterval(() => {
  // Add random jitter of ±5 minutes to spread load
  const jitter = (Math.random() - 0.5) * 10 * 60 * 1000; // ±5 minutes
  setTimeout(checkAlerts, Math.max(0, jitter));
}, 30 * 60 * 1000);

// Cleanup cache every hour
setInterval(cleanupCache, 60 * 60 * 1000);

console.log('🎯 Alert monitor initialized');

module.exports = {
  checkAlerts,
  cleanupCache
};
