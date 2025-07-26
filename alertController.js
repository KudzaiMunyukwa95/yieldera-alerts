const db = require('./database');
const nodemailer = require('nodemailer');

// Email setup - simplified to work with existing setups
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yieldera.co.zw',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'alerts@yieldera.co.zw',
    pass: process.env.SMTP_PASSWORD
  }
});

// Helper function to format numeric values properly (simplified)
function formatNumericValue(value) {
  if (value === null || value === undefined) return value;
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  // If it's a whole number, return as integer
  if (num % 1 === 0) {
    return parseInt(num);
  }
  
  // Otherwise return as float with reasonable precision
  return parseFloat(num.toFixed(2));
}

// Helper function to check if condition is met
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

// Helper function to get date range for period
function getDateRange(period) {
  const now = new Date();
  const start = new Date();
  
  switch (period) {
    case '24h':
      start.setHours(now.getHours() - 24);
      break;
    case '7d':
      start.setDate(now.getDate() - 7);
      break;
    case '30d':
      start.setDate(now.getDate() - 30);
      break;
    default:
      start.setHours(now.getHours() - 24);
  }
  
  return { start, end: now };
}

// Fetch historical weather data from Open-Meteo
async function fetchHistoricalWeather(latitude, longitude, startDate, endDate) {
  try {
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${start}&end_date=${end}&hourly=temperature_2m,windspeed_10m,precipitation&timezone=auto`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.hourly) {
      console.warn('No historical weather data available for coordinates:', latitude, longitude);
      return [];
    }
    
    const hourlyData = [];
    const times = data.hourly.time;
    const temperatures = data.hourly.temperature_2m;
    const windspeeds = data.hourly.windspeed_10m;
    const precipitation = data.hourly.precipitation;
    
    for (let i = 0; i < times.length; i++) {
      hourlyData.push({
        datetime: times[i],
        temperature: temperatures[i],
        windspeed: windspeeds[i],
        rainfall: precipitation[i] || 0
      });
    }
    
    return hourlyData;
  } catch (error) {
    console.error('Error fetching historical weather:', error);
    return [];
  }
}

// CREATE ALERT - Compatible with existing structure
const createAlert = async (req, res) => {
  const {
    field_id,
    alert_type,
    condition_type = 'greater_than',
    threshold_value,
    duration_hours = 0,
    notification_emails,
    active = 1
  } = req.body;

  // Basic validation
  if (!field_id || !alert_type || !threshold_value || !notification_emails) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields' 
    });
  }

  try {
    // Use the same structure as your existing alerts table
    const [result] = await db.query(
      `INSERT INTO alerts (field_id, alert_type, condition_type, threshold_value, duration_hours, notification_emails, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [field_id, alert_type, condition_type, threshold_value, duration_hours, notification_emails, active]
    );

    console.log(`✅ Created alert ${result.insertId} for field ${field_id}`);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('❌ Error inserting alert:', err);
    res.status(500).json({ success: false, message: 'Insert failed', error: err.message });
  }
};

// UPDATE ALERT - Compatible with existing structure
const updateAlert = async (req, res) => {
  const alertId = req.params.id;
  console.log('Updating alert:', alertId, 'with data:', req.body);
  
  const {
    field_id,
    alert_type,
    condition_type,
    threshold_value,
    duration_hours,
    notification_emails,
    active
  } = req.body;

  // Basic validation
  if (!field_id || !alert_type || !threshold_value || !notification_emails) {
    console.error('Validation failed:', { field_id, alert_type, threshold_value, notification_emails });
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields' 
    });
  }

  try {
    // Check if alert exists first
    const [existingAlert] = await db.query('SELECT id FROM alerts WHERE id = ?', [alertId]);
    if (!existingAlert.length) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    // Update using your existing table structure
    const [result] = await db.query(
      `UPDATE alerts SET 
        field_id = ?, 
        alert_type = ?, 
        condition_type = ?, 
        threshold_value = ?, 
        duration_hours = ?, 
        notification_emails = ?, 
        active = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        field_id, 
        alert_type, 
        condition_type || 'greater_than', 
        threshold_value, 
        duration_hours || 0, 
        notification_emails, 
        active !== undefined ? active : 1, 
        alertId
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

// GET ALL ALERTS - Enhanced to include field names
const getAllAlerts = async (req, res) => {
  try {
    console.log('Fetching all alerts...');
    
    // Try the optimized query first, fallback to basic query if fields table doesn't exist
    let alerts;
    try {
      const [optimizedAlerts] = await db.query(`
        SELECT 
          a.*,
          COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
        FROM alerts a
        LEFT JOIN fields f ON a.field_id = f.id
        ORDER BY a.created_at DESC
      `);
      alerts = optimizedAlerts;
    } catch (joinError) {
      console.warn('Could not join with fields table, using basic query:', joinError.message);
      // Fallback to basic query
      const [basicAlerts] = await db.query(`
        SELECT *, CONCAT('Field #', field_id) as field_name 
        FROM alerts 
        ORDER BY created_at DESC
      `);
      alerts = basicAlerts;
    }
    
    // Format numeric values to remove unnecessary decimals
    const processedAlerts = alerts.map(alert => {
      alert.threshold_value = formatNumericValue(alert.threshold_value);
      if (alert.second_threshold_value !== null && alert.second_threshold_value !== undefined) {
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

// GET TRIGGERED ALERTS HISTORY - NEW FEATURE
const getTriggeredAlertsHistory = async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    console.log(`Fetching triggered alerts history for period: ${period}`);
    
    const { start, end } = getDateRange(period);
    
    // Get all active alerts with field coordinates
    let alertsWithFields;
    try {
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
      alertsWithFields = alerts;
    } catch (joinError) {
      console.warn('Could not join with fields table for triggered alerts');
      return res.status(500).json({ 
        success: false, 
        message: 'Could not fetch field coordinates for alerts' 
      });
    }
    
    if (!alertsWithFields.length) {
      return res.json([]);
    }
    
    // Group alerts by field to minimize API calls
    const fieldGroups = {};
    alertsWithFields.forEach(alert => {
      const key = `${alert.latitude}_${alert.longitude}`;
      if (!fieldGroups[key]) {
        fieldGroups[key] = {
          latitude: alert.latitude,
          longitude: alert.longitude,
          field_name: alert.field_name,
          alerts: []
        };
      }
      fieldGroups[key].alerts.push(alert);
    });
    
    const triggeredAlerts = [];
    
    // Process each field group
    for (const [coordKey, fieldGroup] of Object.entries(fieldGroups)) {
      try {
        console.log(`Fetching historical weather for ${fieldGroup.field_name} (${fieldGroup.latitude}, ${fieldGroup.longitude})`);
        
        const weatherData = await fetchHistoricalWeather(
          fieldGroup.latitude, 
          fieldGroup.longitude, 
          start, 
          end
        );
        
        if (!weatherData.length) {
          console.warn(`No weather data available for ${fieldGroup.field_name}`);
          continue;
        }
        
        // Check each alert against each weather data point
        for (const alert of fieldGroup.alerts) {
          for (const weather of weatherData) {
            const weatherValue = weather[alert.alert_type];
            
            if (weatherValue !== null && weatherValue !== undefined) {
              if (isConditionMet(weatherValue, alert.condition_type, alert.threshold_value)) {
                triggeredAlerts.push({
                  alert_id: alert.id,
                  field_id: alert.field_id,
                  field_name: alert.field_name,
                  alert_type: alert.alert_type,
                  condition_type: alert.condition_type,
                  threshold_value: formatNumericValue(alert.threshold_value),
                  triggered_at: weather.datetime,
                  actual_value: formatNumericValue(weatherValue),
                  notification_emails: alert.notification_emails
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing field ${fieldGroup.field_name}:`, error);
        continue;
      }
    }
    
    // Sort by triggered time (most recent first)
    triggeredAlerts.sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at));
    
    console.log(`✅ Found ${triggeredAlerts.length} triggered alerts for period ${period}`);
    res.json(triggeredAlerts);
    
  } catch (err) {
    console.error('❌ Error fetching triggered alerts history:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch triggered alerts history', 
      error: err.message 
    });
  }
};

// GET ALERT BY ID - Enhanced
const getAlertById = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    // Try optimized query first
    let alert;
    try {
      const [rows] = await db.query(`
        SELECT 
          a.*,
          COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
        FROM alerts a
        LEFT JOIN fields f ON a.field_id = f.id
        WHERE a.id = ?
      `, [alertId]);
      alert = rows[0];
    } catch (joinError) {
      console.warn('Could not join with fields table, using basic query');
      const [rows] = await db.query(`
        SELECT *, CONCAT('Field #', field_id) as field_name 
        FROM alerts 
        WHERE id = ?
      `, [alertId]);
      alert = rows[0];
    }
    
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
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

// DELETE ALERT - Basic version
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

// TEST ALERT EMAIL - Simplified version
const testAlert = async (req, res) => {
  try {
    const alertId = req.params.id;
    
    // Get alert with field name
    let alert;
    try {
      const [rows] = await db.query(`
        SELECT 
          a.*,
          COALESCE(f.name, CONCAT('Field #', a.field_id)) as field_name
        FROM alerts a
        LEFT JOIN fields f ON a.field_id = f.id
        WHERE a.id = ?
      `, [alertId]);
      alert = rows[0];
    } catch (joinError) {
      const [rows] = await db.query(`
        SELECT *, CONCAT('Field #', field_id) as field_name 
        FROM alerts 
        WHERE id = ?
      `, [alertId]);
      alert = rows[0];
    }
    
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    
    const { 
      testMessage = '🚨 This is a test alert notification.', 
      testRecipients, 
      sendToAll = false 
    } = req.body;

    // Determine recipients
    let recipients = [];
    if (sendToAll && alert.notification_emails) {
      recipients = alert.notification_emails.split(',').map(e => e.trim()).filter(Boolean);
    } else if (testRecipients) {
      recipients = testRecipients.split(',').map(e => e.trim()).filter(Boolean);
    }

    if (!recipients.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid recipients specified' 
      });
    }

    const fieldName = alert.field_name || `Field #${alert.field_id}`;
    const subject = `TEST ALERT: ${alert.alert_type.toUpperCase()} Alert for ${fieldName}`;
    
    const mailOptions = {
      from: '"Yieldera Test Alerts" <alerts@yieldera.co.zw>',
      to: recipients.join(','),
      subject: subject,
      text: testMessage.replace('{field_name}', fieldName),
      html: `
        <h2>🚨 TEST ALERT</h2>
        <p>${testMessage.replace('{field_name}', fieldName)}</p>
        <hr>
        <p><strong>Alert Details:</strong></p>
        <ul>
          <li><strong>Field:</strong> ${fieldName}</li>
          <li><strong>Type:</strong> ${alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1)}</li>
          <li><strong>Condition:</strong> ${alert.condition_type.replace('_', ' ')} ${alert.threshold_value}</li>
          <li><strong>Status:</strong> ${alert.active ? 'Active' : 'Inactive'}</li>
        </ul>
        <p><em>This is a test email. No actual alert condition has been triggered.</em></p>
      `
    };

    const info = await emailTransporter.sendMail(mailOptions);
    
    console.log(`✅ Test alert sent for alert ${alertId} to ${recipients.length} recipients`);
    res.status(200).json({ 
      success: true, 
      message: 'Test email sent successfully',
      recipients: recipients
    });
    
  } catch (err) {
    console.error('❌ Error in testAlert:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during test alert', 
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
  getTriggeredAlertsHistory  // NEW EXPORT
};
