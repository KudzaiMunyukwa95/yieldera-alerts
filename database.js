// database.js

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'yieldera',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Optional test on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection established.');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to DB:', error.message);
  }
})();

module.exports = pool;
