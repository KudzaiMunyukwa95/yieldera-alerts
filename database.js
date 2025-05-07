// database.js

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Simple wrapper for executing queries
async function query(sql, params) {
  try {
    const [rows, fields] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error("❌ DB Query Error:", error.message);
    throw error;
  }
}

// Test connection at startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Database connection established.");
    conn.release();
  } catch (err) {
    console.error("❌ Failed to connect to DB:", err.message);
  }
})();

module.exports = { query };
