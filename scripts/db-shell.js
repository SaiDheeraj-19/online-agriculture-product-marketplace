#!/usr/bin/env node
/**
 * Interactive SQL Terminal Shell for Online Agriculture Marketplace
 * Connects to the active project database (MySQL or SQLite fallback).
 * 
 * Run with: npm run db:shell
 *       or: node scripts/db-shell.js
 */
const readline = require('readline');
const pool = require('../config/db');

async function main() {
  const status = pool.getStatus();
  const isMysql = status.engine === 'mysql';

  const cliArgs = process.argv.slice(2).join(' ').trim();
  if (cliArgs) {
    try {
      const queryClean = cliArgs.replace(/;+$/, '');
      const [res] = await pool.query(queryClean);
      if (Array.isArray(res)) {
        console.table(res);
        console.log(`\n✅ ${res.length} row(s) returned.`);
      } else {
        console.log('\n✅ Query result:', res);
      }
    } catch (e) {
      console.error('\n❌ SQL Error:', e.message);
    }
    process.exit(0);
  }

  console.log('\n================================================================');
  console.log('🌾 AgriMart — Interactive Database Terminal Shell');
  console.log('================================================================');
  console.log(`Active Engine: ${isMysql ? '🟢 MySQL Server' : '🟡 Local Project DB (SQLite Fallback)'}`);
  console.log(`Target:        ${status.host}:${status.port} / ${status.database}`);
  console.log('----------------------------------------------------------------');
  console.log('💡 Quick Shortcuts:');
  console.log('   .tables              Show all tables in this project');
  console.log('   .schema <table_name> View table structure');
  console.log('   .users               List all registered users');
  console.log('   .products            List all active products in stock');
  console.log('   .orders              List all customer orders');
  console.log('   help                 Show this help menu');
  console.log('   exit / quit          Exit the shell');
  console.log('----------------------------------------------------------------');
  console.log('👉 Or enter any standard SQL query (e.g. SELECT * FROM products;)\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'agrimart-sql> '
  });

  let buffer = '';

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    const raw = line.trim();

    if (!buffer && (!raw || raw.startsWith('--'))) {
      rl.resume();
      rl.prompt();
      return;
    }

    // Handle exit
    if (raw === 'exit' || raw === 'quit' || raw === '.exit' || raw === '.quit') {
      console.log('\n👋 Exiting database shell. Goodbye!\n');
      process.exit(0);
    }

    // Handle help
    if (raw === 'help' || raw === '.help') {
      console.log('\nCommands:');
      console.log('  .tables                 List tables in database');
      console.log('  .schema <table_name>    Display table schema');
      console.log('  .users                  View users table');
      console.log('  .products               View products table');
      console.log('  .orders                 View orders table');
      console.log('  exit / quit             Close terminal session\n');
      rl.resume();
      rl.prompt();
      return;
    }

    // Handle shortcuts
    if (raw === '.tables' || raw.toLowerCase() === 'show tables;' || raw.toLowerCase() === 'show tables') {
      try {
        if (isMysql) {
          const [tables] = await pool.query('SHOW TABLES');
          console.table(tables);
        } else {
          const [tables] = await pool.query("SELECT name AS 'Table Name' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
          console.table(tables);
        }
      } catch (err) {
        console.error('❌ Error:', err.message);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    if (raw.startsWith('.schema')) {
      const parts = raw.split(/\s+/);
      const tableName = parts[1];
      if (!tableName) {
        console.log('Usage: .schema <table_name> (e.g. .schema products)');
      } else {
        try {
          if (isMysql) {
            const [cols] = await pool.query(`DESCRIBE \`${tableName.replace(/`/g, '')}\``);
            console.table(cols);
          } else {
            const [cols] = await pool.query(`PRAGMA table_info(\`${tableName.replace(/`/g, '')}\`)`);
            console.table(cols.map(c => ({ Column: c.name, Type: c.type, NotNull: c.notnull ? 'YES' : 'NO', Default: c.dflt_value, PK: c.pk ? 'YES' : 'NO' })));
          }
        } catch (err) {
          console.error('❌ Error:', err.message);
        }
      }
      rl.resume();
      rl.prompt();
      return;
    }

    if (raw === '.users') {
      try {
        const [rows] = await pool.query('SELECT user_id, name, email, phone, role FROM users');
        console.table(rows);
      } catch (err) {
        console.error('❌ Error:', err.message);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    if (raw === '.products') {
      try {
        const [rows] = await pool.query('SELECT product_id, farmer_id, product_name, category, price, quantity FROM products');
        console.table(rows);
      } catch (err) {
        console.error('❌ Error:', err.message);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    if (raw === '.orders') {
      try {
        const [rows] = await pool.query('SELECT order_id, customer_id, order_date, total_amount, status, delivery_address FROM orders');
        console.table(rows);
      } catch (err) {
        console.error('❌ Error:', err.message);
      }
      rl.resume();
      rl.prompt();
      return;
    }

    // Accumulate query until semicolon or single-line command
    buffer += (buffer ? ' ' : '') + raw;
    if (!raw.endsWith(';') && !buffer.toLowerCase().startsWith('select') && !buffer.toLowerCase().startsWith('show') && !buffer.toLowerCase().startsWith('pragma')) {
      // Wait for more lines
      rl.resume();
      rl.prompt();
      return;
    }

    // If query has semicolon or is a complete statement
    const queryToRun = buffer.replace(/;+$/, '').trim();
    buffer = '';

    try {
      const startTime = Date.now();
      const [result] = await pool.query(queryToRun);
      const elapsed = Date.now() - startTime;

      if (Array.isArray(result)) {
        if (result.length === 0) {
          console.log(`Empty set (${elapsed} ms)`);
        } else {
          console.table(result);
          console.log(`${result.length} row(s) returned (${elapsed} ms)`);
        }
      } else {
        console.log(`Query OK. Affected rows: ${result.affectedRows || 0}, Insert ID: ${result.insertId || 0} (${elapsed} ms)`);
      }
    } catch (err) {
      console.error('❌ SQL Error:', err.message);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Closed database shell.\n');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal Shell Error:', err);
  process.exit(1);
});
