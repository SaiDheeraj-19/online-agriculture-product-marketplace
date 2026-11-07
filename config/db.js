require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'agri_marketplace';

let activeEngine = 'probing'; // 'mysql' | 'sqlite'
let realMySQLPool = null;
let fallbackDb = null;
let probePromise = null;

/**
 * Normalizes SQL queries so they work identically on MySQL and SQLite fallback.
 */
function normalizeSql(sql, params = []) {
  let cleanSql = String(sql)
    .replace(/\s+FOR UPDATE/gi, '')
    .replace(/\bCURDATE\(\)/gi, "DATE('now')");

  let workingParams = Array.isArray(params) ? [...params] : [params];

  // Handle MySQL TRUNCATE in seed script
  if (/^\s*TRUNCATE\s+TABLE\s+(\w+)/i.test(cleanSql)) {
    const match = cleanSql.match(/^\s*TRUNCATE\s+TABLE\s+(\w+)/i);
    return { sql: `DELETE FROM ${match[1]}`, params: [] };
  }

  // Handle MySQL foreign key check directives
  if (/SET\s+FOREIGN_KEY_CHECKS/i.test(cleanSql)) {
    return { sql: 'SELECT 1', params: [] };
  }

  // Handle mysql2 bulk insert syntax: VALUES ?
  if (/VALUES\s+\?/i.test(cleanSql) && Array.isArray(workingParams[0])) {
    const rows = workingParams[0];
    if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
      const placeholders = rows.map((r) => '(' + r.map(() => '?').join(', ') + ')').join(', ');
      cleanSql = cleanSql.replace(/VALUES\s+\?/i, 'VALUES ' + placeholders);
      workingParams = rows.flat();
    }
  }

  // Handle parameters (including expanding array parameters for IN (?) clauses)
  let pIndex = 0;
  let finalParams = [];
  cleanSql = cleanSql.replace(/\?/g, (match) => {
    if (pIndex >= workingParams.length) return match;
    const val = workingParams[pIndex++];
    if (Array.isArray(val)) {
      if (val.length === 0) return 'NULL';
      finalParams.push(...val.map((v) => (v === undefined ? null : v)));
      return val.map(() => '?').join(', ');
    } else {
      finalParams.push(val === undefined ? null : val);
      return '?';
    }
  });

  return { sql: cleanSql, params: finalParams };
}

/**
 * Initializes the SQLite fallback engine with persisted disk storage
 * and executes initial schema if tables do not exist.
 */
function initSQLiteFallback() {
  if (fallbackDb) return fallbackDb;

  const { DatabaseSync } = require('node:sqlite');
  const dbDir = path.join(__dirname, '..', 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'agri_marketplace.sqlite');
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode and foreign keys for durability and performance
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Create tables matching the assignment schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL,
      email    TEXT    NOT NULL UNIQUE,
      phone    TEXT,
      password TEXT    NOT NULL,
      role     TEXT    NOT NULL DEFAULT 'customer' CHECK (role IN ('farmer', 'customer'))
    );

    CREATE TABLE IF NOT EXISTS products (
      product_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id    INTEGER NOT NULL,
      product_name TEXT    NOT NULL,
      category     TEXT    NOT NULL,
      price        REAL    NOT NULL CHECK (price >= 0),
      quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      description  TEXT,
      FOREIGN KEY (farmer_id) REFERENCES users (user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id      INTEGER NOT NULL,
      order_date       TEXT    NOT NULL,
      total_amount     REAL    NOT NULL CHECK (total_amount >= 0),
      delivery_address TEXT    NOT NULL,
      status           TEXT    NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled')),
      FOREIGN KEY (customer_id) REFERENCES users (user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      item_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      price      REAL    NOT NULL CHECK (price >= 0),
      FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products (product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_farmer ON products (farmer_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);
  `);

  // Seed default data if database is fresh
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount && userCount.count === 0) {
    try {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('password123', 10);

      const insUser = db.prepare('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
      const ravi = insUser.run('Ravi Kumar', 'farmer@agrimart.test', '9876543210', hash, 'farmer');
      const meena = insUser.run('Meena Patel', 'farmer2@agrimart.test', '9876501234', hash, 'farmer');
      const ananya = insUser.run('Ananya Sharma', 'customer@agrimart.test', '9123456780', hash, 'customer');

      const insProd = db.prepare('INSERT INTO products (farmer_id, product_name, category, price, quantity, description) VALUES (?, ?, ?, ?, ?, ?)');
      const p1 = insProd.run(Number(ravi.lastInsertRowid), 'Vine-Ripened Tomatoes', 'Vegetables', 40.0, 120, 'Juicy, deep-red tomatoes picked at peak ripeness. Sold per kilogram.');
      const p2 = insProd.run(Number(ravi.lastInsertRowid), 'Baby Spinach', 'Vegetables', 25.0, 80, 'Tender organic spinach leaves, washed and ready for salads or saag. Per bunch.');
      const p3 = insProd.run(Number(ravi.lastInsertRowid), 'Farm Potatoes', 'Vegetables', 30.0, 200, 'Freshly dug potatoes with thin skins. Great for roasting, curries and fries. Per kilogram.');
      const p4 = insProd.run(Number(ravi.lastInsertRowid), 'Aged Basmati Rice', 'Grains', 120.0, 150, 'Long-grain basmati aged for 12 months for a rich aroma. Sold per kilogram.');
      const p5 = insProd.run(Number(ravi.lastInsertRowid), 'Stone-Ground Wheat Flour', 'Grains', 45.0, 100, 'Whole wheat atta milled in small batches. Ideal for soft rotis. Per kilogram.');
      const p6 = insProd.run(Number(ravi.lastInsertRowid), 'Farm Fresh Milk', 'Dairy', 60.0, 50, 'Creamy, antibiotic-free cow milk delivered fresh each morning. Per litre.');
      const p7 = insProd.run(Number(ravi.lastInsertRowid), 'Free-Range Eggs', 'Dairy', 90.0, 40, 'Deep-yellow yolks from pasture-raised hens. One dozen, packed in recycled trays.');
      const p8 = insProd.run(Number(meena.lastInsertRowid), 'Alphonso Mangoes', 'Fruits', 350.0, 60, 'Sweet Ratnagiri Alphonso mangoes, naturally ripened. Sold per dozen.');
      const p9 = insProd.run(Number(meena.lastInsertRowid), 'Robusta Bananas', 'Fruits', 50.0, 90, 'Naturally ripened bananas from our orchard. One dozen.');
      const p10 = insProd.run(Number(meena.lastInsertRowid), 'Toor Dal', 'Pulses', 140.0, 70, 'Hand-sorted pigeon peas with a quick cooking time. Per kilogram.');
      const p11 = insProd.run(Number(meena.lastInsertRowid), 'Turmeric Powder', 'Spices', 80.0, 45, 'Sun-dried and stone-ground turmeric with high curcumin content. Per 250 g pack.');
      const p12 = insProd.run(Number(meena.lastInsertRowid), 'Green Chillies', 'Vegetables', 35.0, 65, 'Bright, crisp green chillies with a clean heat. Per 250 g pack.');

      const insOrder = db.prepare('INSERT INTO orders (customer_id, order_date, total_amount, delivery_address, status) VALUES (?, DATE("now", "-3 days"), ?, ?, ?)');
      const o1 = insOrder.run(Number(ananya.lastInsertRowid), 360.0, '12 Green Park, Bengaluru, Karnataka 560001', 'Delivered');

      const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
      insItem.run(Number(o1.lastInsertRowid), Number(p1.lastInsertRowid), 3, 40.0);
      insItem.run(Number(o1.lastInsertRowid), Number(p4.lastInsertRowid), 1, 120.0);
      insItem.run(Number(o1.lastInsertRowid), Number(p6.lastInsertRowid), 2, 60.0);

      const o2 = insOrder.run(Number(ananya.lastInsertRowid), 400.0, '12 Green Park, Bengaluru, Karnataka 560001', 'Pending');
      insItem.run(Number(o2.lastInsertRowid), Number(p8.lastInsertRowid), 1, 350.0);
      insItem.run(Number(o2.lastInsertRowid), Number(p2.lastInsertRowid), 2, 25.0);
    } catch (seedErr) {
      console.warn('[DB] Fallback seed warning:', seedErr.message);
    }
  }

  fallbackDb = db;
  return fallbackDb;
}

/**
 * Executes a query against the SQLite fallback database, returning MySQL-shaped results.
 */
function runSQLiteQuery(sql, params = []) {
  const db = initSQLiteFallback();
  const normalized = normalizeSql(sql, params);

  const trimmed = normalized.sql.trim();
  const isSelect = /^(SELECT|PRAGMA|SHOW|EXPLAIN)\b/i.test(trimmed);

  try {
    const stmt = db.prepare(normalized.sql);
    if (isSelect) {
      const rows = stmt.all(...normalized.params);
      return [rows, []];
    } else {
      const info = stmt.run(...normalized.params);
      const resultObj = {
        insertId: Number(info.lastInsertRowid) || 0,
        affectedRows: Number(info.changes) || 0,
        changedRows: Number(info.changes) || 0
      };
      return [resultObj, undefined];
    }
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const e = new Error('That record already exists.');
      e.code = 'ER_DUP_ENTRY';
      throw e;
    }
    throw err;
  }
}

/**
 * Checks if MySQL on DB_HOST:DB_PORT is reachable.
 */
async function probeEngine() {
  if (probePromise) return probePromise;

  probePromise = (async () => {
    try {
      const pool = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        decimalNumbers: true,
        dateStrings: true,
        connectTimeout: 1200
      });

      // Probe MySQL connection
      await pool.query('SELECT 1');
      realMySQLPool = pool;
      activeEngine = 'mysql';
      return 'mysql';
    } catch (err) {
      initSQLiteFallback();
      activeEngine = 'sqlite';
      return 'sqlite';
    }
  })();

  return probePromise;
}

// Start probing immediately in the background
probeEngine().catch(() => {});

/**
 * Database proxy pool conforming to the mysql2/promise Pool interface.
 */
const pool = {
  async query(sql, params) {
    const engine = await probeEngine();
    if (engine === 'mysql' && realMySQLPool) {
      try {
        return await realMySQLPool.query(sql, params);
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
          activeEngine = 'sqlite';
          return runSQLiteQuery(sql, params);
        }
        throw err;
      }
    }
    return runSQLiteQuery(sql, params);
  },

  async execute(sql, params) {
    const engine = await probeEngine();
    if (engine === 'mysql' && realMySQLPool) {
      try {
        return await realMySQLPool.execute(sql, params);
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
          activeEngine = 'sqlite';
          return runSQLiteQuery(sql, params);
        }
        throw err;
      }
    }
    return runSQLiteQuery(sql, params);
  },

  async getConnection() {
    const engine = await probeEngine();
    if (engine === 'mysql' && realMySQLPool) {
      try {
        return await realMySQLPool.getConnection();
      } catch (err) {
        activeEngine = 'sqlite';
      }
    }

    // Mock SQLite connection conforming to mysql2/promise Connection
    let inTransaction = false;
    const db = initSQLiteFallback();

    return {
      async query(sql, params) {
        return runSQLiteQuery(sql, params);
      },
      async execute(sql, params) {
        return runSQLiteQuery(sql, params);
      },
      async beginTransaction() {
        if (!inTransaction) {
          try {
            db.exec('BEGIN');
            inTransaction = true;
          } catch (e) {
            // Already in transaction or ignore
          }
        }
      },
      async commit() {
        if (inTransaction) {
          try {
            db.exec('COMMIT');
          } catch (e) {}
          inTransaction = false;
        }
      },
      async rollback() {
        if (inTransaction) {
          try {
            db.exec('ROLLBACK');
          } catch (e) {}
          inTransaction = false;
        }
      },
      release() {
        // no-op for embedded fallback
      }
    };
  },

  async end() {
    if (realMySQLPool) {
      try {
        await realMySQLPool.end();
      } catch (e) {}
      realMySQLPool = null;
    }
  },

  getStatus() {
    return {
      engine: activeEngine,
      isFallback: activeEngine === 'sqlite',
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER
    };
  },

  async recheckConnection() {
    probePromise = null;
    return probeEngine();
  }
};

module.exports = pool;
