/**
 * Seeds the marketplace with demo users, products and orders.
 *
 *   npm run seed
 *
 * WARNING: this clears the four marketplace tables before inserting demo data.
 * Only run it against a development database.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const DEMO_PASSWORD = 'password123';

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function seed() {
  const connection = await pool.getConnection();

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    console.log('Clearing existing marketplace data...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['order_items', 'orders', 'products', 'users']) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Creating demo users...');
    const [ravi] = await connection.execute(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      ['Ravi Kumar', 'farmer@agrimart.test', '9876543210', passwordHash, 'farmer']
    );
    const [meena] = await connection.execute(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      ['Meena Patel', 'farmer2@agrimart.test', '9876501234', passwordHash, 'farmer']
    );
    const [ananya] = await connection.execute(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      ['Ananya Sharma', 'customer@agrimart.test', '9123456780', passwordHash, 'customer']
    );

    console.log('Listing demo products...');
    const products = [
      {
        farmerId: ravi.insertId,
        name: 'Vine-Ripened Tomatoes',
        category: 'Vegetables',
        price: 40.0,
        quantity: 120,
        description: 'Juicy, deep-red tomatoes picked at peak ripeness. Sold per kilogram.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Baby Spinach',
        category: 'Vegetables',
        price: 25.0,
        quantity: 80,
        description: 'Tender organic spinach leaves, washed and ready for salads or saag. Per bunch.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Farm Potatoes',
        category: 'Vegetables',
        price: 30.0,
        quantity: 200,
        description: 'Freshly dug potatoes with thin skins. Great for roasting, curries and fries. Per kilogram.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Aged Basmati Rice',
        category: 'Grains',
        price: 120.0,
        quantity: 150,
        description: 'Long-grain basmati aged for 12 months for a rich aroma. Sold per kilogram.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Stone-Ground Wheat Flour',
        category: 'Grains',
        price: 45.0,
        quantity: 100,
        description: 'Whole wheat atta milled in small batches. Ideal for soft rotis. Per kilogram.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Farm Fresh Milk',
        category: 'Dairy',
        price: 60.0,
        quantity: 50,
        description: 'Creamy, antibiotic-free cow milk delivered fresh each morning. Per litre.'
      },
      {
        farmerId: ravi.insertId,
        name: 'Free-Range Eggs',
        category: 'Dairy',
        price: 90.0,
        quantity: 40,
        description: 'Deep-yellow yolks from pasture-raised hens. One dozen, packed in recycled trays.'
      },
      {
        farmerId: meena.insertId,
        name: 'Alphonso Mangoes',
        category: 'Fruits',
        price: 350.0,
        quantity: 60,
        description: 'Sweet Ratnagiri Alphonso mangoes, naturally ripened. Sold per dozen.'
      },
      {
        farmerId: meena.insertId,
        name: 'Robusta Bananas',
        category: 'Fruits',
        price: 50.0,
        quantity: 90,
        description: 'Naturally ripened bananas from our orchard. One dozen.'
      },
      {
        farmerId: meena.insertId,
        name: 'Toor Dal',
        category: 'Pulses',
        price: 140.0,
        quantity: 70,
        description: 'Hand-sorted pigeon peas with a quick cooking time. Per kilogram.'
      },
      {
        farmerId: meena.insertId,
        name: 'Turmeric Powder',
        category: 'Spices',
        price: 80.0,
        quantity: 45,
        description: 'Sun-dried and stone-ground turmeric with high curcumin content. Per 250 g pack.'
      },
      {
        farmerId: meena.insertId,
        name: 'Green Chillies',
        category: 'Vegetables',
        price: 35.0,
        quantity: 65,
        description: 'Bright, crisp green chillies with a clean heat. Per 250 g pack.'
      }
    ];

    const productIds = {};
    for (const product of products) {
      const [result] = await connection.execute(
        `INSERT INTO products (farmer_id, product_name, category, price, quantity, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          product.farmerId,
          product.name,
          product.category,
          product.price,
          product.quantity,
          product.description
        ]
      );
      productIds[product.name] = result.insertId;
    }

    console.log('Creating sample orders...');
    const orderOneTotal = 40 * 3 + 120 * 1 + 60 * 2; // 360.00
    const [orderOne] = await connection.execute(
      `INSERT INTO orders (customer_id, order_date, total_amount, delivery_address, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        ananya.insertId,
        dateDaysAgo(3),
        orderOneTotal,
        '12 Green Park, Bengaluru, Karnataka 560001',
        'Delivered'
      ]
    );

    await connection.query(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?',
      [
        [
          [orderOne.insertId, productIds['Vine-Ripened Tomatoes'], 3, 40.0],
          [orderOne.insertId, productIds['Aged Basmati Rice'], 1, 120.0],
          [orderOne.insertId, productIds['Farm Fresh Milk'], 2, 60.0]
        ]
      ]
    );

    const orderTwoTotal = 350 * 1 + 25 * 2; // 400.00
    const [orderTwo] = await connection.execute(
      `INSERT INTO orders (customer_id, order_date, total_amount, delivery_address, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        ananya.insertId,
        dateDaysAgo(1),
        orderTwoTotal,
        '12 Green Park, Bengaluru, Karnataka 560001',
        'Pending'
      ]
    );

    await connection.query(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?',
      [
        [
          [orderTwo.insertId, productIds['Alphonso Mangoes'], 1, 350.0],
          [orderTwo.insertId, productIds['Baby Spinach'], 2, 25.0]
        ]
      ]
    );

    console.log('');
    console.log('✅ Seed complete!');
    console.log(`   ${products.length} products · 2 sample orders`);
    console.log('');
    console.log('   Demo accounts (password: password123)');
    console.log('   👨‍🌾 Farmer:   farmer@agrimart.test');
    console.log('   👩‍🌾 Farmer:   farmer2@agrimart.test');
    console.log('   🛍️  Customer: customer@agrimart.test');
    console.log('');
  } finally {
    connection.release();
  }
}

seed()
  .catch((err) => {
    console.error('');
    console.error('❌ Seed failed:', err.message);
    console.error('   Check your .env database settings and make sure database/schema.sql was imported.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
