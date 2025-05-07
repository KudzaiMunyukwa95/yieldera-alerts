-- Alerts table to store alert configurations
CREATE TABLE alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  field_id INT NOT NULL,
  alert_type ENUM('temperature', 'rainfall', 'ndvi', 'wind') NOT NULL,
  condition_type ENUM('lessThan', 'greaterThan', 'equals', 'between') NOT NULL,
  threshold_value DECIMAL(10, 2) NOT NULL,
  second_threshold_value DECIMAL(10, 2) NULL,
  duration_hours INT NOT NULL DEFAULT 1,
  email_notification BOOLEAN DEFAULT TRUE,
  notification_emails TEXT NULL,
  sms_notification BOOLEAN DEFAULT FALSE,
  phone_numbers TEXT NULL,
  notification_frequency ENUM('once', 'hourly', 'daily') NOT NULL DEFAULT 'once',
  active BOOLEAN DEFAULT TRUE,
  last_triggered DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);

-- Alert checks table to log each time an alert condition is checked
CREATE TABLE alert_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  condition_met BOOLEAN NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

-- Alert triggers table to log each time an alert is triggered
CREATE TABLE alert_triggers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

-- NDVI measurements table to store NDVI values for fields
CREATE TABLE ndvi_measurements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_id INT NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);