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
      updateValues.push(query(`
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
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of fieldNameCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      fieldNameCache.delete(key);
    }
  }
  console.log(`🧹 Cache cleanup: ${fieldNameCache.size} entries remaining`);
}

// Run cache cleanup every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);

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
