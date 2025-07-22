const twilio = require('twilio');

// Initialize Twilio client
let twilioClient;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio WhatsApp client initialized');
    console.log(`📱 Using WhatsApp number: ${process.env.TWILIO_WHATSAPP_FROM}`);
  } else {
    console.warn('⚠️ Twilio credentials not found in environment variables');
  }
} catch (error) {
  console.error('❌ Failed to initialize Twilio client:', error);
}

// WhatsApp message cache to prevent spam
const whatsappCache = {
  sentMessages: new Map(),
  COOLDOWN_PERIOD: 30 * 60 * 1000 // 30 minutes
};

// Format phone number for WhatsApp
function formatPhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // Add country code if missing (assuming Zimbabwe +263)
  if (cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '263' + cleaned;
  } else if (cleaned.length === 10 && cleaned.startsWith('07')) {
    cleaned = '263' + cleaned.substring(1);
  } else if (!cleaned.startsWith('263') && cleaned.length <= 9) {
    cleaned = '263' + cleaned;
  }
  
  return `whatsapp:+${cleaned}`;
}

// Validate phone number
function isValidPhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid Zimbabwe number or international format
  return (
    // Zimbabwe mobile numbers: 07X XXX XXXX or 263 7X XXX XXXX
    (cleaned.length === 9 && cleaned.startsWith('7')) ||
    (cleaned.length === 10 && cleaned.startsWith('07')) ||
    (cleaned.length === 12 && cleaned.startsWith('263')) ||
    // International format (10-15 digits)
    (cleaned.length >= 10 && cleaned.length <= 15)
  );
}

// Check if message was recently sent to prevent spam
function isInCooldown(phoneNumber, alertId) {
  const key = `${phoneNumber}-${alertId}`;
  const lastSent = whatsappCache.sentMessages.get(key);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < whatsappCache.COOLDOWN_PERIOD) {
    return true;
  }
  
  return false;
}

// Update cooldown cache
function updateCooldown(phoneNumber, alertId) {
  const key = `${phoneNumber}-${alertId}`;
  whatsappCache.sentMessages.set(key, Date.now());
}

// Send WhatsApp message using template (if available) or regular message
async function sendWhatsAppAlert(alert, field, weatherValue, phoneNumbers, currentWeather = null) {
  if (!twilioClient) {
    console.error('❌ Twilio client not initialized');
    return { success: false, error: 'WhatsApp service not configured' };
  }

  if (!phoneNumbers || !phoneNumbers.trim()) {
    console.warn('⚠️ No phone numbers provided for WhatsApp alert');
    return { success: false, error: 'No phone numbers provided' };
  }

  const numbers = phoneNumbers.split(',').map(n => n.trim()).filter(Boolean);
  const validNumbers = numbers.filter(isValidPhoneNumber);
  
  if (validNumbers.length === 0) {
    console.warn('⚠️ No valid phone numbers found');
    return { success: false, error: 'No valid phone numbers' };
  }

  const results = [];
  
  for (const phoneNumber of validNumbers) {
    try {
      // Check cooldown
      if (isInCooldown(phoneNumber, alert.id)) {
        console.log(`⏰ WhatsApp message to ${phoneNumber} in cooldown period`);
        results.push({ phoneNumber, success: false, error: 'Cooldown period' });
        continue;
      }

      const formattedNumber = formatPhoneNumber(phoneNumber);
      let message_result;

      // Try to use template message first (if content SID is available)
      if (process.env.TWILIO_CONTENT_SID) {
        try {
          // Generate template variables
          const fieldName = field.name || `Field #${field.id}`;
          const alertTypeName = alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1);
          
          const contentVariables = JSON.stringify({
            "1": fieldName,
            "2": `${alertTypeName} Alert`,
            "3": `${weatherValue}${getUnit(alert.alert_type)}`,
            "4": `${getConditionSymbol(alert.condition_type)} ${alert.threshold_value}${getUnit(alert.alert_type)}`
          });

          message_result = await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_FROM,
            to: formattedNumber,
            contentSid: process.env.TWILIO_CONTENT_SID,
            contentVariables: contentVariables
          });

          console.log(`✅ WhatsApp template alert sent to ${phoneNumber} (SID: ${message_result.sid})`);
        } catch (templateError) {
          console.warn(`⚠️ Template message failed, falling back to regular message: ${templateError.message}`);
          
          // Fallback to regular message
          const message = generateWhatsAppMessage(alert, field, weatherValue, currentWeather);
          message_result = await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_FROM,
            to: formattedNumber,
            body: message
          });

          console.log(`✅ WhatsApp regular alert sent to ${phoneNumber} (SID: ${message_result.sid})`);
        }
      } else {
        // Use regular message
        const message = generateWhatsAppMessage(alert, field, weatherValue, currentWeather);
        message_result = await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: formattedNumber,
          body: message
        });

        console.log(`✅ WhatsApp alert sent to ${phoneNumber} (SID: ${message_result.sid})`);
      }

      // Update cooldown
      updateCooldown(phoneNumber, alert.id);
      
      results.push({ 
        phoneNumber, 
        success: true, 
        messageSid: message_result.sid 
      });

    } catch (error) {
      console.error(`❌ Failed to send WhatsApp to ${phoneNumber}:`, error.message);
      results.push({ 
        phoneNumber, 
        success: false, 
        error: error.message 
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  
  return {
    success: successCount > 0,
    totalSent: successCount,
    totalAttempted: validNumbers.length,
    results
  };
}

// Helper functions for message formatting
function getConditionSymbol(condition) {
  const symbols = {
    greater_than: '>',
    less_than: '<',
    equal_to: '='
  };
  return symbols[condition] || '?';
}

function getUnit(alertType) {
  const units = {
    temperature: '°C',
    windspeed: 'km/h', 
    rainfall: 'mm',
    ndvi: ''
  };
  return units[alertType] || '';
}

// Generate WhatsApp message content
function generateWhatsAppMessage(alert, field, weatherValue, currentWeather = null) {
  const conditionSymbols = {
    greater_than: '>',
    less_than: '<',
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
  
  const alertEmojis = {
    temperature: '🌡️',
    windspeed: '💨',
    rainfall: '🌧️',
    ndvi: '🌱'
  };
  
  const alertEmoji = alertEmojis[alert.alert_type] || '⚠️';
  const alertTypeName = alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1);
  
  const fieldName = field.name || `Field #${field.id}`;
  const farmInfo = field.farm_name ? ` (${field.farm_name})` : '';
  const farmerInfo = field.farmer_name ? ` - ${field.farmer_name}` : '';

  let weatherContext = '';
  if (currentWeather) {
    const weatherParts = [];
    if (currentWeather.temperature !== undefined) {
      weatherParts.push(`🌡️ ${currentWeather.temperature.toFixed(1)}°C`);
    }
    if (currentWeather.windspeed !== undefined) {
      weatherParts.push(`💨 ${currentWeather.windspeed.toFixed(1)} km/h`);
    }
    if (currentWeather.rainfall !== undefined) {
      weatherParts.push(`🌧️ ${currentWeather.rainfall.toFixed(1)} mm`);
    }
    
    if (weatherParts.length > 0) {
      weatherContext = `\n\n*Current Weather:*\n${weatherParts.join('\n')}`;
    }
  }

  const message = `🚨 *YIELDERA WEATHER ALERT*

${alertEmoji} *${alertTypeName} Alert Triggered*

*Field:* ${fieldName}${farmInfo}${farmerInfo}
*Alert Type:* ${alertTypeName}
*Current Value:* ${weatherValue}${unit}
*Threshold:* ${symbol} ${alert.threshold_value}${unit}
*Status:* ⚠️ Threshold condition met

*Time:* ${new Date().toLocaleString()}${weatherContext}

This is an automated alert from the Yieldera Weather Monitoring System.

© ${new Date().getFullYear()} Yieldera. All rights reserved.`;

  return message;
}

// Send test WhatsApp message
async function sendTestWhatsApp(phoneNumbers, message, fieldName = 'Test Field') {
  if (!twilioClient) {
    throw new Error('WhatsApp service not configured');
  }

  const numbers = phoneNumbers.split(',').map(n => n.trim()).filter(Boolean);
  const validNumbers = numbers.filter(isValidPhoneNumber);
  
  if (validNumbers.length === 0) {
    throw new Error('No valid phone numbers provided');
  }

  const testMessage = `🧪 *YIELDERA TEST ALERT*

${message.replace('{field_name}', fieldName)}

*This is a test message from Yieldera Weather Alert System.*

Time: ${new Date().toLocaleString()}

© ${new Date().getFullYear()} Yieldera. All rights reserved.`;

  const results = [];
  
  for (const phoneNumber of validNumbers) {
    try {
      const formattedNumber = formatPhoneNumber(phoneNumber);
      
      const message_result = await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: formattedNumber,
        body: testMessage
      });

      console.log(`✅ Test WhatsApp sent to ${phoneNumber} (SID: ${message_result.sid})`);
      
      results.push({ 
        phoneNumber, 
        success: true, 
        messageSid: message_result.sid 
      });

    } catch (error) {
      console.error(`❌ Failed to send test WhatsApp to ${phoneNumber}:`, error.message);
      results.push({ 
        phoneNumber, 
        success: false, 
        error: error.message 
      });
    }
  }

  return {
    success: results.some(r => r.success),
    results
  };
}

// Test Twilio connection
async function testTwilioConnection() {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized');
  }

  try {
    // Test by fetching account details
    const account = await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    console.log(`✅ Twilio connection successful. Account: ${account.friendlyName}`);
    return { success: true, account: account.friendlyName };
  } catch (error) {
    console.error('❌ Twilio connection test failed:', error.message);
    throw error;
  }
}

// Cleanup old cooldown entries
function cleanupCooldowns() {
  const now = Date.now();
  const cutoff = now - whatsappCache.COOLDOWN_PERIOD;
  
  for (const [key, timestamp] of whatsappCache.sentMessages.entries()) {
    if (timestamp < cutoff) {
      whatsappCache.sentMessages.delete(key);
    }
  }
  
  console.log(`🧹 Cleaned up WhatsApp cooldown cache, ${whatsappCache.sentMessages.size} entries remaining`);
}

// Cleanup every hour
setInterval(cleanupCooldowns, 60 * 60 * 1000);

module.exports = {
  sendWhatsAppAlert,
  sendTestWhatsApp,
  formatPhoneNumber,
  isValidPhoneNumber,
  testTwilioConnection,
  cleanupCooldowns
};
