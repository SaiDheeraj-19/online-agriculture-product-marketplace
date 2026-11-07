require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: 'agri.sid',
    secret: process.env.SESSION_SECRET || 'agri-marketplace-development-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'unavailable' });
  }
});

// Unknown API routes return JSON, never HTML.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Static frontend (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ER_ACCESS_DENIED_ERROR' ||
    err.code === 'ER_BAD_DB_ERROR' ||
    err.code === 'ER_NO_SUCH_TABLE'
  ) {
    return res.status(500).json({
      error: 'Database unavailable. Make sure MySQL is running and the schema has been imported.'
    });
  }

  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('🌾 Online Agriculture Product Marketplace');
  console.log(`   Server: http://localhost:${PORT}`);
  console.log('');

  pool
    .query('SELECT 1')
    .then(() => console.log('   MySQL: connected'))
    .catch(() => {
      console.warn('   MySQL: not reachable');
      console.warn('   → Create .env from .env.example, import database/schema.sql, then run npm run seed.');
    });
});
