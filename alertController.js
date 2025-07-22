const db = require('./database');
const nodemailer = require('nodemailer');
const whatsappService = require('./whatsappService');

// Email setup
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Cache for field names to improve performance
const fieldNameCache = new Map();
let fieldCacheLastUpdate = 0;
const FIELD_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to format numeric values properly
function formatNumericValue(value) {
  if (value === null || value === undefined) return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  // If it's a whole number, return as integer
  if (num % 1 === 0) {
    return parseInt(num);
  }
  
  // Otherwise return as float, removing unnecessary trailing zeros
  return parseFloat(num.toFixed(3));
}

// Update field name cache
async function updateFieldNameCache() {
  try {
    const now = Date.now();
    if (now - fieldCacheLastUpdate < FIELD_CACHE_DURATION && fieldNameCache.size > 0) {
      return; // Cache is still valid
    }

    const [fields] = await db.query('SELECT id, name FROM fields');
    fieldNameCache.clear();
    
    fields.forEach(field => {
      fieldNameCache.set(field.id, field.name || `Unnamed Field #${field.id}`);
    });
    
    fieldCacheLastUpdate = now;
    console.log(`✅ Updated field name cache with ${fields.length} fields`);
  } catch (error) {
    console.error('❌ Error updating field name cache:', error);
  }
}

// Get field name from cache or database
async function getFieldName(fieldId) {
  // Update cache if needed
  await updateFieldNameCache();
  
  return fieldNameCache.get(fieldId) || `Field #${fieldId}`;
}

// CREATE ALERT - UPDATED WITH WHATSAPP SUPPORT
const createAlert = async (req, res) => {
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    phone_numbers, // NEW: WhatsApp phone numbers
    sms_notification = 0, // NEW: Enable/disable WhatsApp
    active = 1
  } = req.body;

  // Validate required fields
  if (!field_id || !alert_type || !threshold_value) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: field_id, alert_type, threshold_value' 
    });
  }

  // Validate that at least one notification method is provided
  if (!notification_emails && !phone_numbers) {
    return res.status(400).json({ 
      success: false, 
      message: 'At least one notification method (email or WhatsApp) must be provided' 
    });
  }

  // Validate alert_type
  const validAlertTypes = ['temperature', 'windspeed', 'rainfall', 'ndvi'];
  if (!validAlertTypes.includes(alert_type)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid alert_type. Must be one of: ' + validAlertTypes.join(', ') 
    });
  }

  // Validate condition_type
  const validConditions = ['greater_than', 'less_than', 'equal_to'];
  if (!validConditions.includes(condition_type)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid condition_type. Must be one of: ' + validConditions.join(', ') 
    });
  }

  // Validate phone numbers if provided
  if (phone_numbers && sms_notification) {
    const numbers = phone_numbers.split(',').map(n => n.trim()).filter(Boolean);
    const invalidNumbers = numbers.filter(num => !whatsappService.isValidPhoneNumber(num));
    
    if (invalidNumbers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid phone numbers: ${invalidNumbers.join(', ')}. Please use format: +263771234567 or 0771234567` 
      });
    }
  }

  try {
    const [result] = await db.query(
      `INSERT INTO alerts (
        field_id, alert_type, condition_type, threshold_value, duration_hours, 
        notification_emails, phone_numbers, sms_notification, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        field_id, alert_type, condition_type, threshold_value, duration_hours, 
        notification_emails || null, phone_numbers || null, sms_notification, active
      ]
    );

    console.log(`✅ Created alert ${result.insertId} for field ${field_id}`);
    console.log(`📧 Email: ${notification_emails ? 'Yes' : 'No'}, 📱 WhatsApp: ${sms_notification && phone_numbers ? 'Yes' : 'No'}`);
    
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('❌ Error inserting alert:', err);
    res.status(500).json({ success: false, message: 'Insert failed', error: err.message });
  }
};

// UPDATE ALERT - UPDATED WITH WHATSAPP SUPPORT
const updateAlert = async (req, res) => {
  const alertId = req.params.id;
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    phone_numbers, // NEW: WhatsApp phone numbers
    sms_notification = 0, // NEW: Enable/disable WhatsApp
    active
  } = req.body;

  // Validate required fields
  if (!field_id || !alert_type || !threshold_value) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: field_id, alert_type, threshold_value' 
    });
  }

  // Validate that at least one notification method is provided
  if (!notification_emails && !phone_numbers) {
    return res.status(400).json({ 
      success: false, 
      message: 'At least one notification method (email or WhatsApp) must be provided' 
    });
  }

  // Validate phone numbers if provided
  if (phone_numbers && sms_notification) {
    const numbers = phone_numbers.split(',').map(n => n.trim()).filter(Boolean);
    const invalidNumbers = numbers.filter(num => !whatsappService.isValidPhoneNumber(num));
    
    if (invalidNumbers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid phone numbers: ${invalidNumbers.join(', ')}. Please use format: +263771234567 or 0771234567` 
      });
    }
  }

  try {
    const [result] = await db.query(
      `UPDATE alerts SET 
        field_id = ?, 
        alert_type = ?, 
        condition_type = ?, 
        threshold_value = ?, 
        duration_hours = ?, 
        notification_emails = ?, 
        phone_numbers = ?,
        sms_notification = ?,
        active = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        field_id, alert_type, condition_type, threshold_value, duration_hours, 
        notification_emails || null, phone_numbers || null, sms_notification, active, alertId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    console.log(`✅ Updated alert ${alertId}`);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('❌ Error updating alert:', err);
    res.status(500).json({ success: false, message: 'Update failed', error: err.message });
  }
};

// GET ALL ALERTS - ALREADY SUPPORTS WHATSAPP FIELDS
const getAllAlerts = async (req, res) => {
  try {
    // Update field name cache before querying
    await updateFieldNameCache();

    const [alerts] = await db.query(`
      SELECT 
        a.id,
        a.field_id,
        a.alert_type,
        a.condition_type,
        a.threshold_value,
        a.second_threshold_value,
        a.duration_hours,
        a.email_notification,
        a.notification_emails,
        a.sms_notification,
        a.phone_numbers,
        a.notification_frequency,
        a.active,
        a.last_triggered,
        a.created_at,
        a.updated_at,
        a.owner_type,
        a.owner_id,
        COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      ORDER BY a.created_at DESC
    `);
    
    // Ensure all alerts have field_name populated and format numeric values
    const processedAlerts = alerts.map(alert => {
      if (!alert.field_name || alert.field_name.startsWith('Field #')) {
        // Try to get from cache as fallback
        const cachedName = fieldNameCache.get(alert.field_id);
        if (cachedName) {
          alert.field_name = cachedName;
        }
      }
      
      // Format numeric values to remove unnecessary decimals
      alert.threshold_value = formatNumericValue(alert.threshold_value);
      if (alert.second_threshold_value !== null) {
        alert.second_threshold_value = formatNumericValue(alert.second_threshold_value);
      }
      
      return alert;
    });
    
    console.log(`✅ Retrieved ${processedAlerts.length} alerts`);
    res.status(200).json(processedAlerts);
  } catch (err) {
    console.error('❌ Error fetching alerts:', err);
    res.status(500).json({ success: false, message: 'Fetch failed', error: err.message });
  }
};

// GET ALERT BY ID - ALREADY SUPPORTS WHATSAPP FIELDS
const getAlertById = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    const [rows] = await db.query(`
      SELECT 
        a.*,
        COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      WHERE a.id = ?
    `, [alertId]);
    
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    
    const alert = rows[0];
    
    // Fallback to cache if join didn't work
    if (!alert.field_name || alert.field_name.startsWith('Field #')) {
      await updateFieldNameCache();
      const cachedName = fieldNameCache.get(alert.field_id);
      if (cachedName) {
        alert.field_name = cachedName;
      }
    }
    
    // Format numeric values
    alert.threshold_value = formatNumericValue(alert.threshold_value);
    if (alert.second_threshold_value !== null) {
      alert.second_threshold_value = formatNumericValue(alert.second_threshold_value);
    }
    
    console.log(`✅ Retrieved alert ${alertId}`);
    res.json(alert);
  } catch (err) {
    console.error('❌ Error getting alert:', err);
    res.status(500).json({ success: false, message: 'Fetch failed', error: err.message });
  }
};

// DELETE ALERT - NO CHANGES NEEDED
const deleteAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [alertId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    
    console.log(`✅ Deleted alert ${alertId}`);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('❌ Error deleting alert:', err);
    res.status(500).json({ success: false, message: 'Delete failed', error: err.message });
  }
};

// TEST ALERT EMAIL AND WHATSAPP - UPDATED
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    const [rows] = await db.query(`
      SELECT 
        a.*,
        COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      WHERE a.id = ?
    `, [alertId]);
    
    const alert = rows[0];
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    // Fallback to cache if join didn't work
    if (!alert.field_name || alert.field_name.startsWith('Field #')) {
      const fieldName = await getFieldName(alert.field_id);
      alert.field_name = fieldName;
    }
    
    const { 
      testMessage = '🚨 This is a test alert notification.', 
      testRecipients, 
      testPhoneNumbers, // NEW: Test WhatsApp numbers
      sendToAll = false,
      testWhatsApp = false // NEW: Enable WhatsApp testing
    } = req.body;

    let emailResults = null;
    let whatsappResults = null;

    // Test Email Notifications
    if (alert.notification_emails) {
      // Determine email recipients
      let emailRecipients = [];
      if (sendToAll && alert.notification_emails) {
        emailRecipients = alert.notification_emails.split(',').map(e => e.trim()).filter(Boolean);
      } else if (testRecipients) {
        emailRecipients = testRecipients.split(',').map(e => e.trim()).filter(Boolean);
      }

      if (emailRecipients.length > 0) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emailRecipients.filter(email => !emailRegex.test(email));
        if (invalidEmails.length > 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Invalid email addresses: ${invalidEmails.join(', ')}` 
          });
        }

        // Send test email
        try {
          await sendTestEmail(alert, emailRecipients, testMessage);
          emailResults = { success: true, recipients: emailRecipients };
        } catch (error) {
          emailResults = { success: false, error: error.message };
        }
      }
    }

    // Test WhatsApp Notifications
    if (testWhatsApp && (alert.phone_numbers || testPhoneNumbers)) {
      // Determine WhatsApp recipients
      let phoneNumbers = '';
      if (sendToAll && alert.phone_numbers) {
        phoneNumbers = alert.phone_numbers;
      } else if (testPhoneNumbers) {
        phoneNumbers = testPhoneNumbers;
      }

      if (phoneNumbers.trim()) {
        try {
          whatsappResults = await whatsappService.sendTestWhatsApp(
            phoneNumbers, 
            testMessage, 
            alert.field_name
          );
        } catch (error) {
          whatsappResults = { success: false, error: error.message };
        }
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: 'Test notifications sent',
      results: {}
    };

    if (emailResults) {
      response.results.email = emailResults;
    }

    if (whatsappResults) {
      response.results.whatsapp = whatsappResults;
    }

    if (!emailResults && !whatsappResults) {
      return res.status(400).json({
        success: false,
        message: 'No notification methods were tested. Please specify recipients for email or WhatsApp.'
      });
    }

    console.log(`✅ Test alert completed for alert ${alertId}`);
    res.status(200).json(response);
    
  } catch (err) {
    console.error('❌ Error in testAlert:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during test alert', 
      error: err.message 
    });
  }
};

// Send test email helper function
async function sendTestEmail(alert, recipients, testMessage) {
  const alertTypeEmoji = {
    temperature: '🌡️',
    windspeed: '💨', 
    rainfall: '🌧️',
    ndvi: '🌱'
  }[alert.alert_type] || '⚠️';

  const subject = `TEST ALERT: ${alert.alert_type.toUpperCase()} Alert for ${alert.field_name}`;
  
  const htmlMessage = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Alert - Yieldera</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #01282F; color: #B6BF00; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; border-left: 4px solid #B6BF00; }
        .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
        .alert-badge { background: #ff4444; color: white; padding: 5px 10px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>YIELDERA TEST ALERT</h1>
        </div>
        <div class="content">
          <div class="alert-badge">${alertTypeEmoji} TEST ALERT</div>
          <h2>Test Alert Notification</h2>
          <p>${testMessage.replace('{field_name}', alert.field_name)}</p>
          <hr>
          <p><strong>Alert Details:</strong></p>
          <ul>
            <li><strong>Field:</strong> ${alert.field_name}</li>
            <li><strong>Type:</strong> ${alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1)}</li>
            <li><strong>Condition:</strong> ${alert.condition_type.replace('_', ' ')} ${alert.threshold_value}</li>
            <li><strong>Status:</strong> ${alert.active ? 'Active' : 'Inactive'}</li>
          </ul>
          <p><em>This is a test email. No actual alert condition has been triggered.</em></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Yieldera. All rights reserved.</p>
          <p>This is an automated test message from the Yieldera Alert System.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: '"Yieldera Test Alerts" <alerts@yieldera.co.zw>',
    to: recipients.join(','),
    subject: subject,
    text: testMessage.replace('{field_name}', alert.field_name),
    html: htmlMessage
  };

  const info = await emailTransporter.sendMail(mailOptions);
  return info;
}

// GET ALERTS BY FIELD - NO CHANGES NEEDED
const getAlertsByField = async (req, res) => {
  try {
    const fieldId = req.params.fieldId;
    
    const [alerts] = await db.query(`
      SELECT 
        a.*,
        COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      WHERE a.field_id = ?
      ORDER BY a.created_at DESC
    `, [fieldId]);
    
    console.log(`✅ Retrieved ${alerts.length} alerts for field ${fieldId}`);
    
    // Format numeric values for all alerts
    const formattedAlerts = alerts.map(alert => {
      alert.threshold_value = formatNumericValue(alert.threshold_value);
      if (alert.second_threshold_value !== null) {
        alert.second_threshold_value = formatNumericValue(alert.second_threshold_value);
      }
      return alert;
    });
    
    res.json(formattedAlerts);
  } catch (err) {
    console.error('❌ Error fetching field alerts:', err);
    res.status(500).json({ success: false, message: 'Fetch failed', error: err.message });
  }
};

// BULK TOGGLE ALERTS - NO CHANGES NEEDED
const bulkToggleAlerts = async (req, res) => {
  try {
    const { alertIds, active } = req.body;
    
    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'alertIds must be a non-empty array' 
      });
    }

    if (typeof active !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'active must be a boolean value' 
      });
    }

    const placeholders = alertIds.map(() => '?').join(',');
    const [result] = await db.query(
      `UPDATE alerts SET active = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
      [active, ...alertIds]
    );

    console.log(`✅ Bulk updated ${result.affectedRows} alerts`);
    res.json({ 
      success: true, 
      affectedRows: result.affectedRows,
      updatedAlerts: alertIds 
    });
  } catch (err) {
    console.error('❌ Error in bulk toggle:', err);
    res.status(500).json({ success: false, message: 'Bulk update failed', error: err.message });
  }
};

// HEALTH CHECK ENDPOINT - UPDATED WITH WHATSAPP STATUS
const healthCheck = async (req, res) => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    
    // Test email configuration (without sending)
    const emailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
    
    // Test WhatsApp configuration
    const whatsappConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      email: emailConfigured ? 'configured' : 'not configured',
      whatsapp: whatsappConfigured ? 'configured' : 'not configured',
      fieldCacheSize: fieldNameCache.size,
      fieldCacheLastUpdate: new Date(fieldCacheLastUpdate).toISOString()
    });
  } catch (err) {
    console.error('❌ Health check failed:', err);
    res.status(500).json({ 
      success: false, 
      status: 'unhealthy', 
      error: err.message 
    });
  }
};

module.exports = {
  createAlert,
  updateAlert,
  getAllAlerts,
  getAlertById,
  deleteAlert,
  testAlert,
  getAlertsByField,
  bulkToggleAlerts,
  healthCheck
};
