// alertController.js - Controller for alert-related API endpoints

const db = require('./database'); // Import your database connection
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { checkCondition } = require('./alertMonitor'); // Import helper functions from the alert monitor

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
const twilioClient = process.env.TWILIO_ENABLED === 'true' ? 
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

/**
 * Get all alerts
 */
exports.getAllAlerts = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { field_id, alert_type, active, status } = req.query;
    
    // Build the WHERE clause based on filters
    let whereClause = '';
    let params = [];
    
    const conditions = [];
    
    if (field_id) {
      conditions.push('field_id = ?');
      params.push(field_id);
    }
    
    if (alert_type) {
      conditions.push('alert_type = ?');
      params.push(alert_type);
    }
    
    if (active !== undefined) {
      conditions.push('active = ?');
      params.push(active === 'true' || active === '1' ? 1 : 0);
    }
    
    // For "triggered" status, we need to check if it was triggered in the last 24 hours
    if (status === 'triggered') {
      conditions.push('last_triggered IS NOT NULL AND last_triggered > DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    // Get alerts from database
    const alerts = await db.query(`
      SELECT a.*, f.name as field_name, f.farm_name
      FROM alerts a
      JOIN fields f ON a.field_id = f.id
      ${whereClause}
      ORDER BY a.created_at DESC
    `, params);
    
    // For each alert, get the trigger history
    for (const alert of alerts) {
      const triggerHistory = await db.query(`
        SELECT * FROM alert_triggers
        WHERE alert_id = ?
        ORDER BY timestamp DESC
        LIMIT 10
      `, [alert.id]);
      
      alert.triggerHistory = triggerHistory;
    }
    
    res.json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get a specific alert by ID
 */
exports.getAlertById = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    // Get alert from database
    const alerts = await db.query(`
      SELECT a.*, f.name as field_name, f.farm_name
      FROM alerts a
      JOIN fields f ON a.field_id = f.id
      WHERE a.id = ?
    `, [alertId]);
    
    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    const alert = alerts[0];
    
    // Get trigger history
    const triggerHistory = await db.query(`
      SELECT * FROM alert_triggers
      WHERE alert_id = ?
      ORDER BY timestamp DESC
      LIMIT 10
    `, [alertId]);
    
    alert.triggerHistory = triggerHistory;
    
    // Get recent alert checks
    const alertChecks = await db.query(`
      SELECT * FROM alert_checks
      WHERE alert_id = ?
      ORDER BY timestamp DESC
      LIMIT 24
    `, [alertId]);
    
    alert.alertChecks = alertChecks;
    
    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error(`Error getting alert ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Create a new alert
 */
exports.createAlert = async (req, res) => {
  try {
    const {
      name,
      fieldId,
      alertType,
      conditionType,
      thresholdValue,
      secondThresholdValue,
      durationHours,
      emailNotification,
      notificationEmails,
      smsNotification,
      phoneNumbers,
      notificationFrequency,
      active
    } = req.body;
    
    // Validate required fields
    if (!name || !fieldId || !alertType || !conditionType || thresholdValue === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    // Validate the field exists
    const fields = await db.query('SELECT id FROM fields WHERE id = ?', [fieldId]);
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Field not found'
      });
    }
    
    // For "between" condition, second threshold is required
    if (conditionType === 'between' && secondThresholdValue === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Second threshold value is required for "between" condition'
      });
    }
    
    // Ensure email recipients are provided if email notification is enabled
    if (emailNotification && !notificationEmails) {
      return res.status(400).json({
        success: false,
        message: 'Email recipients are required when email notification is enabled'
      });
    }
    
    // Ensure phone numbers are provided if SMS notification is enabled
    if (smsNotification && !phoneNumbers) {
      return res.status(400).json({
        success: false,
        message: 'Phone numbers are required when SMS notification is enabled'
      });
    }
    
    // Insert the new alert
    const result = await db.query(`
      INSERT INTO alerts (
        name,
        field_id,
        alert_type,
        condition_type,
        threshold_value,
        second_threshold_value,
        duration_hours,
        email_notification,
        notification_emails,
        sms_notification,
        phone_numbers,
        notification_frequency,
        active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      fieldId,
      alertType,
      conditionType,
      thresholdValue,
      secondThresholdValue || null,
      durationHours || 1,
      emailNotification === true || emailNotification === 'true' ? 1 : 0,
      notificationEmails || null,
      smsNotification === true || smsNotification === 'true' ? 1 : 0,
      phoneNumbers || null,
      notificationFrequency || 'once',
      active === true || active === 'true' ? 1 : 0
    ]);
    
    // Get the created alert
    const alertId = result.insertId;
    const alerts = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    
    res.status(201).json({
      success: true,
      message: 'Alert created successfully',
      data: alerts[0]
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update an existing alert
 */
exports.updateAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    const {
      name,
      fieldId,
      alertType,
      conditionType,
      thresholdValue,
      secondThresholdValue,
      durationHours,
      emailNotification,
      notificationEmails,
      smsNotification,
      phoneNumbers,
      notificationFrequency,
      active
    } = req.body;
    
    // Check if alert exists
    const alerts = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    // Validate required fields
    if (!name || !fieldId || !alertType || !conditionType || thresholdValue === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }
    
    // Validate the field exists
    const fields = await db.query('SELECT id FROM fields WHERE id = ?', [fieldId]);
    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Field not found'
      });
    }
    
    // For "between" condition, second threshold is required
    if (conditionType === 'between' && secondThresholdValue === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Second threshold value is required for "between" condition'
      });
    }
    
    // Ensure email recipients are provided if email notification is enabled
    if (emailNotification && !notificationEmails) {
      return res.status(400).json({
        success: false,
        message: 'Email recipients are required when email notification is enabled'
      });
    }
    
    // Ensure phone numbers are provided if SMS notification is enabled
    if (smsNotification && !phoneNumbers) {
      return res.status(400).json({
        success: false,
        message: 'Phone numbers are required when SMS notification is enabled'
      });
    }
    
    // Update the alert
    await db.query(`
      UPDATE alerts SET
        name = ?,
        field_id = ?,
        alert_type = ?,
        condition_type = ?,
        threshold_value = ?,
        second_threshold_value = ?,
        duration_hours = ?,
        email_notification = ?,
        notification_emails = ?,
        sms_notification = ?,
        phone_numbers = ?,
        notification_frequency = ?,
        active = ?
      WHERE id = ?
    `, [
      name,
      fieldId,
      alertType,
      conditionType,
      thresholdValue,
      secondThresholdValue || null,
      durationHours || 1,
      emailNotification === true || emailNotification === 'true' ? 1 : 0,
      notificationEmails || null,
      smsNotification === true || smsNotification === 'true' ? 1 : 0,
      phoneNumbers || null,
      notificationFrequency || 'once',
      active === true || active === 'true' ? 1 : 0,
      alertId
    ]);
    
    // Get the updated alert
    const updatedAlerts = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    
    res.json({
      success: true,
      message: 'Alert updated successfully',
      data: updatedAlerts[0]
    });
  } catch (error) {
    console.error(`Error updating alert ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete an alert
 */
exports.deleteAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    // Check if alert exists
    const alerts = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    // Delete the alert
    await db.query('DELETE FROM alerts WHERE id = ?', [alertId]);
    
    res.json({
      success: true,
      message: 'Alert deleted successfully',
      data: {}
    });
  } catch (error) {
    console.error(`Error deleting alert ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get alert history for a specific alert
 */
exports.getAlertHistory = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    // Check if alert exists
    const alerts = await db.query('SELECT * FROM alerts WHERE id = ?', [alertId]);
    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    // Get trigger history
    const triggerHistory = await db.query(`
      SELECT * FROM alert_triggers
      WHERE alert_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [alertId]);
    
    // Get check history
    const checkHistory = await db.query(`
      SELECT * FROM alert_checks
      WHERE alert_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [alertId]);
    
    res.json({
      success: true,
      data: {
        alert: alerts[0],
        triggerHistory,
        checkHistory
      }
    });
  } catch (error) {
    console.error(`Error getting alert history for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Manually test an alert by sending a test notification
 */
exports.testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    const { testMessage, testRecipients, sendToAll } = req.body;
    
    // Get the alert
    const alerts = await db.query(`
      SELECT a.*, f.name as field_name, f.farm_name
      FROM alerts a
      JOIN fields f ON a.field_id = f.id
      WHERE a.id = ?
    `, [alertId]);
    
    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    const alert = alerts[0];
    
    // Get test value (fake a value that would trigger the alert)
    let testValue;
    switch (alert.condition_type) {
      case 'lessThan':
        testValue = parseFloat(alert.threshold_value) - 1;
        break;
      case 'greaterThan':
        testValue = parseFloat(alert.threshold_value) + 1;
        break;
      case 'equals':
        testValue = parseFloat(alert.threshold_value);
        break;
      case 'between':
        testValue = (parseFloat(alert.threshold_value) + parseFloat(alert.second_threshold_value)) / 2;
        break;
      default:
        testValue = parseFloat(alert.threshold_value);
    }
    
    // Get unit based on alert type
    let unitSuffix = '';
    switch (alert.alert_type) {
      case 'temperature':
        unitSuffix = '°C';
        break;
      case 'rainfall':
        unitSuffix = 'mm';
        break;
      case 'ndvi':
        unitSuffix = '';
        break;
      case 'wind':
        unitSuffix = 'km/h';
        break;
    }
    
    // Build test message
    const message = testMessage || `
TEST ALERT: ${alert.name}

This is a test notification for the alert "${alert.name}" on field "${alert.field_name}".

If this were a real alert, the following condition would have been met:
${capitalizeFirstLetter(alert.alert_type)} ${getConditionText(alert)} for at least ${alert.duration_hours} hour(s).

Test value: ${testValue}${unitSuffix}

Field Details:
- Farm: ${alert.farm_name}
- Crop: ${alert.crop || 'N/A'}
- Area: ${alert.area_ha} hectares

This is a test notification from the Yieldera platform.
    `;
    
    let emailSuccess = false;
    let smsSuccess = false;
    
    // Send email notification
    if (alert.email_notification) {
      const emailRecipients = sendToAll ? 
        alert.notification_emails.split(',').map(email => email.trim()).filter(email => email) :
        testRecipients ? testRecipients.split(',').map(email => email.trim()).filter(email => email) : [];
      
      if (emailRecipients.length > 0) {
        try {
          await sendEmailNotification(emailRecipients, `TEST: ${alert.name}`, message);
          emailSuccess = true;
        } catch (error) {
          console.error('Error sending test email:', error);
        }
      }
    }
    
    // Send SMS notification
    if (alert.sms_notification && twilioClient) {
      const phoneNumbers = sendToAll ? 
        alert.phone_numbers.split(',').map(number => number.trim()).filter(number => number) :
        testRecipients ? testRecipients.split(',').map(number => number.trim()).filter(number => number) : [];
      
      if (phoneNumbers.length > 0) {
        try {
          // Shorten message for SMS
          const shortMessage = `TEST: ${alert.name}. ${message.split('\n\n')[0]} ${message.split('\n\n')[1]}`;
          
          await sendSMSNotification(phoneNumbers, shortMessage);
          smsSuccess = true;
        } catch (error) {
          console.error('Error sending test SMS:', error);
        }
      }
    }
    
    // Log test alert
    await db.query(`
      INSERT INTO alert_triggers (alert_id, value, notification_sent, timestamp, is_test)
      VALUES (?, ?, true, NOW(), true)
    `, [alertId, testValue]);
    
    res.json({
      success: true,
      message: 'Test alert sent',
      data: {
        emailSuccess,
        smsSuccess
      }
    });
  } catch (error) {
    console.error(`Error testing alert ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get alert statistics
 */
exports.getAlertStats = async (req, res) => {
  try {
    // Get stats from database
    const [
      totalAlertsResult,
      activeAlertsResult,
      triggeredTodayResult,
      notificationsSentResult
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM alerts'),
      db.query('SELECT COUNT(*) as count FROM alerts WHERE active = true'),
      db.query(`
        SELECT COUNT(*) as count FROM alerts
        WHERE last_triggered >= CURDATE()
      `),
      db.query(`
        SELECT COUNT(*) as count FROM alert_triggers
        WHERE notification_sent = true AND is_test = false
      `)
    ]);
    
    const totalAlerts = totalAlertsResult[0].count;
    const activeAlerts = activeAlertsResult[0].count;
    const triggeredToday = triggeredTodayResult[0].count;
    const notificationsSent = notificationsSentResult[0].count;
    
    // Get alerts grouped by type
    const alertTypeStats = await db.query(`
      SELECT alert_type, COUNT(*) as count 
      FROM alerts 
      GROUP BY alert_type
    `);
    
    // Get alerts grouped by field
    const alertFieldStats = await db.query(`
      SELECT f.name as field_name, COUNT(a.id) as count
      FROM alerts a
      JOIN fields f ON a.field_id = f.id
      GROUP BY a.field_id
      ORDER BY count DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: {
        totalAlerts,
        activeAlerts,
        triggeredToday,
        notificationsSent,
        alertTypeStats,
        alertFieldStats
      }
    });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/* Helper Functions */

/**
 * Send email notification
 */
async function sendEmailNotification(recipients, subject, message) {
  // Send the email
  const mailOptions = {
    from: '"Yieldera Alerts" <alerts@yieldera.com>',
    to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
    subject: subject,
    text: message,
    html: message.replace(/\n/g, '<br>')
  };
  
  const info = await emailTransporter.sendMail(mailOptions);
  console.log(`Email sent: ${info.messageId}`);
  return info;
}

/**
 * Send SMS notification
 */
async function sendSMSNotification(phoneNumbers, message) {
  if (!twilioClient) {
    throw new Error('Twilio client not configured');
  }
  
  const results = [];
  
  // Send SMS to each number
  for (const number of Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers]) {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: number
    });
    
    console.log(`SMS sent: ${result.sid}`);
    results.push(result);
  }
  
  return results;
}

/**
 * Get condition text from alert data
 */
function getConditionText(alert) {
  switch (alert.condition_type) {
    case 'lessThan':
      return `below ${alert.threshold_value}`;
    case 'greaterThan':
      return `above ${alert.threshold_value}`;
    case 'equals':
      return `equal to ${alert.threshold_value}`;
    case 'between':
      return `between ${alert.threshold_value} and ${alert.second_threshold_value}`;
    default:
      return `at ${alert.threshold_value}`;
  }
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
