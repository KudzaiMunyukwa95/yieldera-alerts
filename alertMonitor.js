// alertMonitor.js - Backend service for monitoring alerts

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const schedule = require('node-schedule');
const axios = require('axios');

// Database connection (replace with your actual DB connection)
const db = require('./database'); 

// Configure email transport
const emailTransporter = nodemailer.createTransport({
  host: 'mail.yieldera.co.zw',
  port: 465,
  secure: true,
  auth: {
    user: 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});


// Configure SMS client (Twilio)
const twilioClient = process.env.TWILIO_ENABLED === 'true' ? 
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Weather API configuration
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';

// Schedule the alert check to run every hour
const alertJob = schedule.scheduleJob('0 * * * *', async function() {
  console.log('Running scheduled alert check - ' + new Date().toISOString());
  await checkAllAlerts();
});

// Main function to check all alerts
async function checkAllAlerts() {
  try {
    // Get all active alerts from database
    const alerts = await db.query(`
      SELECT * FROM alerts 
      WHERE active = true
    `);
    
    console.log(`Checking ${alerts.length} active alerts`);
    
    // Process each alert
    for (const alert of alerts) {
      await processAlert(alert);
    }
    
    console.log('Alert check completed');
  } catch (error) {
    console.error('Error checking alerts:', error);
  }
}

// Process a single alert
async function processAlert(alert) {
  try {
    // Get the field data for this alert
    const field = await db.query(`
      SELECT * FROM fields WHERE id = ?
    `, [alert.fieldId]);
    
    if (!field || field.length === 0) {
      console.error(`Field not found for alert ${alert.id}`);
      return;
    }
    
    // Get the current value for the alert type
    const currentValue = await getCurrentValue(alert.alertType, field[0]);
    
    // Check if the alert condition is met
    const condition = checkCondition(alert, currentValue);
    
    // Log alert check
    await logAlertCheck(alert.id, currentValue, condition);
    
    // Check for persistence duration
    if (condition) {
      const persistentCondition = await checkPersistence(alert, currentValue);
      
      if (persistentCondition) {
        // Trigger the alert if the condition has persisted
        await triggerAlert(alert, field[0], currentValue);
      }
    }
  } catch (error) {
    console.error(`Error processing alert ${alert.id}:`, error);
  }
}

// Get current value based on alert type
async function getCurrentValue(alertType, field) {
  switch (alertType) {
    case 'temperature':
      return await getTemperature(field);
    case 'rainfall':
      return await getRainfall(field);
    case 'ndvi':
      return await getNDVI(field);
    case 'wind':
      return await getWindSpeed(field);
    default:
      throw new Error(`Unknown alert type: ${alertType}`);
  }
}

// Get temperature for a field
async function getTemperature(field) {
  try {
    // Extract field coordinates
    const lat = field.center_lat;
    const lon = field.center_lon;
    
    // Fetch weather data from Open-Meteo
    const response = await axios.get(WEATHER_API_URL, {
      params: {
        latitude: lat,
        longitude: lon,
        current_weather: true
      }
    });
    
    return response.data.current_weather.temperature;
  } catch (error) {
    console.error('Error fetching temperature:', error);
    throw error;
  }
}

// Get rainfall for a field
async function getRainfall(field) {
  try {
    // Extract field coordinates
    const lat = field.center_lat;
    const lon = field.center_lon;
    
    // For rainfall, we need to get daily data
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch weather data from Open-Meteo
    const response = await axios.get('https://archive-api.open-meteo.com/v1/archive', {
      params: {
        latitude: lat,
        longitude: lon,
        start_date: today,
        end_date: today,
        daily: 'precipitation_sum'
      }
    });
    
    // Get today's rainfall
    return response.data.daily.precipitation_sum[0] || 0;
  } catch (error) {
    console.error('Error fetching rainfall:', error);
    throw error;
  }
}

// Get NDVI for a field
async function getNDVI(field) {
  try {
    // In a real implementation, you would fetch this from your GEE API
    // For example purposes, we'll simulate it
    
    // Get field geometry
    const fieldId = field.id;
    
    // Query for the latest NDVI value
    const ndviRecord = await db.query(`
      SELECT value FROM ndvi_measurements 
      WHERE field_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [fieldId]);
    
    if (ndviRecord && ndviRecord.length > 0) {
      return ndviRecord[0].value;
    }
    
    // Fallback value if no NDVI record is found
    return 0.5; // Default middle value
  } catch (error) {
    console.error('Error fetching NDVI:', error);
    throw error;
  }
}

// Get wind speed for a field
async function getWindSpeed(field) {
  try {
    // Extract field coordinates
    const lat = field.center_lat;
    const lon = field.center_lon;
    
    // Fetch weather data from Open-Meteo
    const response = await axios.get(WEATHER_API_URL, {
      params: {
        latitude: lat,
        longitude: lon,
        current_weather: true
      }
    });
    
    return response.data.current_weather.windspeed;
  } catch (error) {
    console.error('Error fetching wind speed:', error);
    throw error;
  }
}

// Check if a condition is met
function checkCondition(alert, currentValue) {
  switch (alert.conditionType) {
    case 'lessThan':
      return currentValue < alert.thresholdValue;
    case 'greaterThan':
      return currentValue > alert.thresholdValue;
    case 'equals':
      // For equals, we'll use a small range around the value
      return Math.abs(currentValue - alert.thresholdValue) < 0.1;
    case 'between':
      return currentValue >= alert.thresholdValue && 
             currentValue <= alert.secondThresholdValue;
    default:
      return false;
  }
}

// Check if a condition has persisted for the required duration
async function checkPersistence(alert, currentValue) {
  try {
    // Get the history of alert checks
    const history = await db.query(`
      SELECT * FROM alert_checks 
      WHERE alert_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [alert.id, alert.durationHours]);
    
    // If we don't have enough history, the condition hasn't persisted long enough
    if (history.length < alert.durationHours) {
      return false;
    }
    
    // Check if all historical checks met the condition
    return history.every(check => check.condition_met);
  } catch (error) {
    console.error('Error checking persistence:', error);
    return false;
  }
}

// Log an alert check
async function logAlertCheck(alertId, value, conditionMet) {
  try {
    await db.query(`
      INSERT INTO alert_checks (alert_id, value, condition_met, timestamp)
      VALUES (?, ?, ?, NOW())
    `, [alertId, value, conditionMet]);
  } catch (error) {
    console.error('Error logging alert check:', error);
  }
}

// Trigger an alert by sending notifications
async function triggerAlert(alert, field, currentValue) {
  try {
    // Check if this alert was already triggered recently
    // and respect the notification frequency setting
    const shouldNotify = await checkNotificationFrequency(alert);
    
    if (!shouldNotify) {
      console.log(`Skipping notification for alert ${alert.id} due to frequency settings`);
      return;
    }
    
    // Get unit suffix based on alert type
    const unitSuffix = getUnitSuffix(alert.alertType);
    
    // Construct alert message
    const message = constructAlertMessage(alert, field, currentValue, unitSuffix);
    
    // Send email notification if configured
    if (alert.emailNotification && alert.notificationEmails) {
      await sendEmailNotification(alert, message);
    }
    
    // Send SMS notification if configured
    if (alert.smsNotification && alert.phoneNumbers && twilioClient) {
      await sendSMSNotification(alert, message);
    }
    
    // Log the alert trigger
    await logAlertTrigger(alert.id, currentValue);
    
    console.log(`Alert ${alert.id} triggered and notifications sent`);
  } catch (error) {
    console.error(`Error triggering alert ${alert.id}:`, error);
  }
}

// Check if notification should be sent based on frequency settings
async function checkNotificationFrequency(alert) {
  try {
    // Get the latest trigger
    const latestTrigger = await db.query(`
      SELECT * FROM alert_triggers 
      WHERE alert_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [alert.id]);
    
    // If no previous trigger, always notify
    if (!latestTrigger || latestTrigger.length === 0) {
      return true;
    }
    
    const lastTriggerTime = new Date(latestTrigger[0].timestamp);
    const now = new Date();
    
    // Based on frequency setting
    switch (alert.notificationFrequency) {
      case 'once':
        // For 'once' frequency, check if the condition was reset after last trigger
        const resetAfterTrigger = await db.query(`
          SELECT COUNT(*) as count FROM alert_checks 
          WHERE alert_id = ? AND timestamp > ? AND condition_met = false
        `, [alert.id, lastTriggerTime.toISOString()]);
        
        // Only notify if the condition was reset and then met again
        return resetAfterTrigger[0].count > 0;
      
      case 'hourly':
        // Notify if last trigger was more than an hour ago
        return (now - lastTriggerTime) >= 60 * 60 * 1000;
      
      case 'daily':
        // Notify if last trigger was more than a day ago
        return (now - lastTriggerTime) >= 24 * 60 * 60 * 1000;
      
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking notification frequency:', error);
    return true; // Default to sending notification on error
  }
}

// Get unit suffix based on alert type
function getUnitSuffix(alertType) {
  switch (alertType) {
    case 'temperature':
      return '°C';
    case 'rainfall':
      return 'mm';
    case 'ndvi':
      return '';
    case 'wind':
      return 'km/h';
    default:
      return '';
  }
}

// Construct alert message
function constructAlertMessage(alert, field, currentValue, unitSuffix) {
  // Get condition text
  let conditionText;
  switch (alert.conditionType) {
    case 'lessThan':
      conditionText = `below ${alert.thresholdValue}${unitSuffix}`;
      break;
    case 'greaterThan':
      conditionText = `above ${alert.thresholdValue}${unitSuffix}`;
      break;
    case 'equals':
      conditionText = `equal to ${alert.thresholdValue}${unitSuffix}`;
      break;
    case 'between':
      conditionText = `between ${alert.thresholdValue}${unitSuffix} and ${alert.secondThresholdValue}${unitSuffix}`;
      break;
    default:
      conditionText = `at ${alert.thresholdValue}${unitSuffix}`;
  }
  
  // Format the message
  return `
ALERT: ${alert.name}

Field "${field.name}" has reported ${capitalizeFirstLetter(alert.alertType)} ${conditionText}.
Current value: ${currentValue}${unitSuffix}

This condition has persisted for at least ${alert.durationHours} hour(s).

Field Details:
- Farm: ${field.farm_name}
- Crop: ${field.crop || 'N/A'}
- Area: ${field.area_ha} hectares

Please check the Yieldera dashboard for more details.
https://yieldera.co.zw/dashboard.html?field=${field.id}

This is an automated alert from the Yieldera platform.
  `;
}

// Send email notification
async function sendEmailNotification(alert, message) {
  // Parse email recipients
  const recipients = alert.notificationEmails.split(',').map(email => email.trim()).filter(email => email);
  
  if (recipients.length === 0) {
    console.log(`No valid email recipients for alert ${alert.id}`);
    return;
  }
  
  // Send the email
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.com>',
    to: recipients.join(', '),
    subject: `ALERT: ${alert.name}`,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };
  
  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
    return false;
  }
}

// Send SMS notification
async function sendSMSNotification(alert, message) {
  // Parse phone numbers
  const phoneNumbers = alert.phoneNumbers.split(',').map(number => number.trim()).filter(number => number);
  
  if (phoneNumbers.length === 0) {
    console.log(`No valid phone numbers for alert ${alert.id}`);
    return;
  }
  
  // Shorten message for SMS
  const shortMessage = `Yieldera Alert: ${alert.name}. ${message.split('\n\n')[0]} ${message.split('\n\n')[1]}`;
  
  try {
    // Send SMS to each number
    for (const number of phoneNumbers) {
      const result = await twilioClient.messages.create({
        body: shortMessage,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: number
      });
      
      console.log(`SMS sent: ${result.sid}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error sending SMS notification:', error);
    return false;
  }
}

// Log an alert trigger
async function logAlertTrigger(alertId, value) {
  try {
    await db.query(`
      INSERT INTO alert_triggers (alert_id, value, notification_sent, timestamp)
      VALUES (?, ?, true, NOW())
    `, [alertId, value]);
    
    // Also update the alert's last_triggered timestamp
    await db.query(`
      UPDATE alerts 
      SET last_triggered = NOW() 
      WHERE id = ?
    `, [alertId]);
  } catch (error) {
    console.error('Error logging alert trigger:', error);
  }
}

// Utility function to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Export main functions for external use (e.g. manual trigger or testing)
module.exports = {
  checkAllAlerts,
  processAlert,
  checkCondition,
  triggerAlert
};
