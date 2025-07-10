const db = require('./database');
const nodemailer = require('nodemailer');

// Email setup with connection pooling for better performance
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  pool: true, // Enable connection pooling
  maxConnections: 5, // Limit concurrent connections
  maxMessages: 100, // Messages per connection
  rateLimit: 10, // Messages per second
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  },
  // Add timeout settings
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000,
  socketTimeout: 45000
});

// In-memory cache for field names and other frequently accessed data
const fieldNameCache = new Map();
const alertCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const MAX_CACHE_SIZE = 1000; // Maximum cache entries

// Cache cleanup to prevent memory leaks
function cleanupCache(cache) {
  if (cache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
        deletedCount++;
      }
      
      // Stop after cleaning 20% of cache
      if (deletedCount > MAX_CACHE_SIZE * 0.2) break;
    }
  }
}

// Helper function to get field name with caching
async function getFieldName(fieldId) {
  const cacheKey = `field_${fieldId}`;
  const cached = fieldNameCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }
  
  try {
    const [rows] = await db.query('SELECT name FROM fields WHERE id = ? LIMIT 1', [fieldId]);
    const name = rows.length ? rows[0].name : `Field #${fieldId}`;
    
    // Cache the result
    fieldNameCache.set(cacheKey, {
      name,
      timestamp: Date.now()
    });
    
    // Cleanup cache if it gets too large
    cleanupCache(fieldNameCache);
    
    return name;
  } catch (error) {
    console.warn(`Failed to fetch field name for ID ${fieldId}:`, error);
    return `Field #${fieldId}`;
  }
}

// Normalize alert type for compatibility between frontend and database
function normalizeAlertType(alertType) {
  // Convert 'windspeed' to 'wind' for database compatibility
  if (alertType === 'windspeed') return 'wind';
  return alertType;
}

// Denormalize alert type for frontend compatibility
function denormalizeAlertType(alertType) {
  // Convert 'wind' to 'windspeed' for frontend compatibility
  if (alertType === 'wind') return 'windspeed';
  return alertType;
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate and clean email list
function validateEmailList(emailString) {
  if (!emailString || typeof emailString !== 'string') {
    return { valid: false, message: 'Email list is required' };
  }
  
  const emails = emailString.split(',').map(email => email.trim()).filter(Boolean);
  
  if (emails.length === 0) {
    return { valid: false, message: 'At least one email address is required' };
  }
  
  const invalidEmails = emails.filter(email => !isValidEmail(email));
  
  if (invalidEmails.length > 0) {
    return { 
      valid: false, 
      message: `Invalid email addresses: ${invalidEmails.join(', ')}` 
    };
  }
  
  return { valid: true, emails: emails.join(', ') };
}

// CREATE ALERT - Optimized for your database schema
const createAlert = async (req, res) => {
  const startTime = Date.now();
  
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    active = 1,
    owner_type = 'farmer',
    owner_id = 0,
    name = ''
  } = req.body;

  // Validate required fields
  if (!field_id || !alert_type || threshold_value === undefined || threshold_value === null || !notification_emails) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: field_id, alert_type, threshold_value, notification_emails' 
    });
  }

  // Validate threshold value
  if (isNaN(parseFloat(threshold_value))) {
    return res.status(400).json({
      success: false,
      message: 'Threshold value must be a valid number'
    });
  }

  // Validate and clean email list
  const emailValidation = validateEmailList(notification_emails);
  if (!emailValidation.valid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.message
    });
  }

  // Normalize alert type to match database enum
  const normalizedAlertType = normalizeAlertType(alert_type);

  // Validate alert type
  const validAlertTypes = ['temperature', 'rainfall', 'ndvi', 'wind'];
  if (!validAlertTypes.includes(normalizedAlertType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid alert type. Must be one of: ${validAlertTypes.join(', ')}`
    });
  }

  // Validate condition type
  const validConditionTypes = ['greater_than', 'less_than', 'equal_to'];
  if (!validConditionTypes.includes(condition_type)) {
    return res.status(400).json({
      success: false,
      message: `Invalid condition type. Must be one of: ${validConditionTypes.join(', ')}`
    });
  }

  try {
    // Check if field exists (optional validation)
    const [fieldCheck] = await db.query('SELECT id FROM fields WHERE id = ? LIMIT 1', [field_id]);
    if (fieldCheck.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Field not found'
      });
    }

    const [result] = await db.query(
      `INSERT INTO alerts (
        field_id, alert_type, condition_type, threshold_value, duration_hours, 
        notification_emails, active, owner_type, owner_id, name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        field_id, 
        normalizedAlertType, 
        condition_type, 
        parseFloat(threshold_value), 
        parseInt(duration_hours) || 0, 
        emailValidation.emails, 
        active ? 1 : 0, 
        owner_type, 
        parseInt(owner_id) || 0,
        name || ''
      ]
    );

    // Clear related caches
    alertCache.clear();

    const duration = Date.now() - startTime;
    console.log(`✅ Alert created successfully in ${duration}ms (ID: ${result.insertId})`);

    res.status(201).json({ 
      success: true, 
      id: result.insertId,
      message: 'Alert created successfully'
    });
  } catch (err) {
    console.error('❌ Error inserting alert:', err);
    
    // Handle specific database errors
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        success: false, 
        message: 'Referenced field does not exist' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create alert', 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// UPDATE ALERT - Optimized for your database schema
const updateAlert = async (req, res) => {
  const startTime = Date.now();
  const alertId = req.params.id;
  
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    active,
    owner_type = 'farmer',
    owner_id = 0,
    name = ''
  } = req.body;

  // Validate alert ID
  if (!alertId || isNaN(parseInt(alertId))) {
    return res.status(400).json({
      success: false,
      message: 'Valid alert ID is required'
    });
  }

  // Validate threshold value if provided
  if (threshold_value !== undefined && isNaN(parseFloat(threshold_value))) {
    return res.status(400).json({
      success: false,
      message: 'Threshold value must be a valid number'
    });
  }

  // Validate and clean email list if provided
  if (notification_emails) {
    const emailValidation = validateEmailList(notification_emails);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.message
      });
    }
  }

  try {
    // Check if alert exists first
    const [existingAlert] = await db.query('SELECT * FROM alerts WHERE id = ? LIMIT 1', [alertId]);
    if (existingAlert.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Prepare update data - only update provided fields
    const updateFields = [];
    const updateValues = [];

    if (field_id !== undefined) {
      updateFields.push('field_id = ?');
      updateValues.push(field_id);
    }

    if (alert_type !== undefined) {
      updateFields.push('alert_type = ?');
      updateValues.push(normalizeAlertType(alert_type));
    }

    if (condition_type !== undefined) {
      updateFields.push('condition_type = ?');
      updateValues.push(condition_type);
    }

    if (threshold_value !== undefined) {
      updateFields.push('threshold_value = ?');
      updateValues.push(parseFloat(threshold_value));
    }

    if (duration_hours !== undefined) {
      updateFields.push('duration_hours = ?');
      updateValues.push(parseInt(duration_hours) || 0);
    }

    if (notification_emails !== undefined) {
      const emailValidation = validateEmailList(notification_emails);
      updateFields.push('notification_emails = ?');
      updateValues.push(emailValidation.emails);
    }

    if (active !== undefined) {
      updateFields.push('active = ?');
      updateValues.push(active ? 1 : 0);
    }

    if (owner_type !== undefined) {
      updateFields.push('owner_type = ?');
      updateValues.push(owner_type);
    }

    if (owner_id !== undefined) {
      updateFields.push('owner_id = ?');
      updateValues.push(parseInt(owner_id) || 0);
    }

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }

    updateFields.push('updated_at = NOW()');

    if (updateFields.length === 1) { // Only updated_at
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const updateQuery = `UPDATE alerts SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(alertId);

    const [result] = await db.query(updateQuery, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Clear related caches
    alertCache.clear();

    const duration = Date.now() - startTime;
    console.log(`✅ Alert updated successfully in ${duration}ms (ID: ${alertId})`);

    res.json({
      success: true,
      message: 'Alert updated successfully'
    });
  } catch (err) {
    console.error('❌ Error updating alert:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// GET ALL ALERTS
const getAllAlerts = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { field_id, alert_type, active, owner_type, owner_id } = req.query;
    
    let whereClause = '';
    const queryParams = [];
    
    if (field_id) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'field_id = ?';
      queryParams.push(field_id);
    }
    
    if (alert_type) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'alert_type = ?';
      queryParams.push(normalizeAlertType(alert_type));
    }
    
    if (active !== undefined) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'active = ?';
      queryParams.push(active === 'true' ? 1 : 0);
    }
    
    if (owner_type) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'owner_type = ?';
      queryParams.push(owner_type);
    }
    
    if (owner_id) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'owner_id = ?';
      queryParams.push(owner_id);
    }

    const [alerts] = await db.query(`
      SELECT 
        a.*,
        f.name as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      ${whereClause}
      ORDER BY a.created_at DESC
    `, queryParams);

    // Denormalize alert types for frontend
    const processedAlerts = alerts.map(alert => ({
      ...alert,
      alert_type: denormalizeAlertType(alert.alert_type)
    }));

    const duration = Date.now() - startTime;
    console.log(`✅ Retrieved ${alerts.length} alerts in ${duration}ms`);

    res.json({
      success: true,
      data: processedAlerts
    });
  } catch (err) {
    console.error('❌ Error getting alerts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alerts',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// GET ALERT BY ID
const getAlertById = async (req, res) => {
  const alertId = req.params.id;

  if (!alertId || isNaN(parseInt(alertId))) {
    return res.status(400).json({
      success: false,
      message: 'Valid alert ID is required'
    });
  }

  try {
    const [alerts] = await db.query(`
      SELECT 
        a.*,
        f.name as field_name
      FROM alerts a
      LEFT JOIN fields f ON a.field_id = f.id
      WHERE a.id = ?
      LIMIT 1
    `, [alertId]);

    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    const alert = {
      ...alerts[0],
      alert_type: denormalizeAlertType(alerts[0].alert_type)
    };

    res.json({
      success: true,
      data: alert
    });
  } catch (err) {
    console.error('❌ Error getting alert:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alert',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// DELETE ALERT
const deleteAlert = async (req, res) => {
  const alertId = req.params.id;

  if (!alertId || isNaN(parseInt(alertId))) {
    return res.status(400).json({
      success: false,
      message: 'Valid alert ID is required'
    });
  }

  try {
    const [result] = await db.query('DELETE FROM alerts WHERE id = ?', [alertId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Clear related caches
    alertCache.clear();

    console.log(`✅ Alert deleted successfully (ID: ${alertId})`);

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (err) {
    console.error('❌ Error deleting alert:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// TEST ALERT
const testAlert = async (req, res) => {
  const { emails, message } = req.body;

  if (!emails || !message) {
    return res.status(400).json({
      success: false,
      message: 'Email addresses and message are required'
    });
  }

  const emailValidation = validateEmailList(emails);
  if (!emailValidation.valid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.message
    });
  }

  try {
    const emailList = emailValidation.emails.split(', ');
    
    const mailOptions = {
      from: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
      to: emailList,
      subject: 'YielderA Alert System Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c5282;">YielderA Alert System Test</h2>
          <p>This is a test email from the YielderA alert system.</p>
          <div style="background-color: #f7fafc; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Test Message:</strong></p>
            <p>${message}</p>
          </div>
          <p>If you received this email, the alert system is working correctly.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #718096;">
            This is an automated message from YielderA Alert System.<br>
            Please do not reply to this email.
          </p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (err) {
    console.error('❌ Error sending test email:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// GET ALERT STATISTICS
const getAlertStats = async (req, res) => {
  try {
    const { field_id, owner_type, owner_id } = req.query;
    
    let whereClause = '';
    const queryParams = [];
    
    if (field_id) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'field_id = ?';
      queryParams.push(field_id);
    }
    
    if (owner_type) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'owner_type = ?';
      queryParams.push(owner_type);
    }
    
    if (owner_id) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'owner_id = ?';
      queryParams.push(owner_id);
    }

    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_alerts,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_alerts,
        SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) as inactive_alerts,
        COUNT(DISTINCT field_id) as monitored_fields,
        SUM(CASE WHEN alert_type = 'temperature' THEN 1 ELSE 0 END) as temperature_alerts,
        SUM(CASE WHEN alert_type = 'rainfall' THEN 1 ELSE 0 END) as rainfall_alerts,
        SUM(CASE WHEN alert_type = 'wind' THEN 1 ELSE 0 END) as wind_alerts,
        SUM(CASE WHEN alert_type = 'ndvi' THEN 1 ELSE 0 END) as ndvi_alerts
      FROM alerts
      ${whereClause}
    `, queryParams);

    res.json({
      success: true,
      data: stats[0]
    });
  } catch (err) {
    console.error('❌ Error getting alert stats:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get alert statistics', 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// Cleanup function for cache management
function cleanupCacheScheduled() {
  const now = Date.now();
  for (const [key, value] of fieldNameCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      fieldNameCache.delete(key);
    }
  }
  console.log(`🧹 Cache cleanup: ${fieldNameCache.size} entries remaining`);
}

// Run cache cleanup every 10 minutes
setInterval(cleanupCacheScheduled, 10 * 60 * 1000);

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('📤 Gracefully shutting down alert controller...');
  emailTransporter.close();
});

module.exports = {
  createAlert,
  updateAlert,
  getAllAlerts,
  getAlertById,
  deleteAlert,
  testAlert,
  getAlertStats
};
