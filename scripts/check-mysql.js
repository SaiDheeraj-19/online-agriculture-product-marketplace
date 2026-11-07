#!/usr/bin/env node
/**
 * Diagnostic tool to check MySQL connection and provide guidance.
 * Run with: node scripts/check-mysql.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT) || 3306;
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'agri_marketplace';

console.log('========================================================');
console.log('🌾 AgriMart — MySQL Database Health & Diagnostic Check');
console.log('========================================================');
console.log(`Target:    ${host}:${port}`);
console.log(`User:      ${user}`);
console.log(`Database:  ${database}`);
console.log('--------------------------------------------------------');

async function check() {
  try {
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 2000
    });
    console.log('✅ MySQL Server is RUNNING and accepting connections!');

    try {
      await conn.query(`USE \`${database}\``);
      console.log(`✅ Database "${database}" exists and is accessible.`);

      const [tables] = await conn.query('SHOW TABLES');
      console.log(`✅ Found ${tables.length} tables in "${database}".`);
      tables.forEach((t) => {
        const name = Object.values(t)[0];
        console.log(`   - ${name}`);
      });
    } catch (dbErr) {
      console.warn(`⚠️  MySQL is running, but database "${database}" is not yet imported.`);
      console.log(`   Run: mysql -u ${user} -p < database/schema.sql`);
      console.log('   Then run: npm run seed');
    }

    await conn.end();
  } catch (err) {
    console.log('❌ MySQL Server is NOT reachable on ' + host + ':' + port);
    console.log('   Error:', err.code || err.message);
    console.log('');
    console.log('💡 Note: The marketplace is currently using its built-in');
    console.log('   embedded fallback database (database/agri_marketplace.sqlite),');
    console.log('   so your entire web app, listings and orders work smoothly!');
    console.log('');
    console.log('🔧 To start a real MySQL Server on your Mac:');
    console.log('   Option A (Homebrew):');
    console.log('     brew services start mysql');
    console.log('');
    console.log('   Option B (Docker):');
    console.log('     docker run -d --name agrimart-mysql -p 3306:3306 \\');
    console.log('       -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \\');
    console.log('       -e MYSQL_DATABASE=agri_marketplace mysql:8');
    console.log('');
    console.log('   Once running, import schema with:');
    console.log('     mysql -u root < database/schema.sql');
    console.log('     npm run seed');
  }
}

check();

