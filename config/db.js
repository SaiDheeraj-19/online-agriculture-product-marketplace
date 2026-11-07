require('dotenv').config();

const mysql = require('mysql2/promise');

// A connection pool is shared across the whole app so requests never block
// each other waiting for a single MySQL connection.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agri_marketplace',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  dateStrings: true
});

module.exports = pool;
