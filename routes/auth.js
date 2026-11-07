const express = require('express');
const bcrypt = require('bcryptjs');

const pool = require('../config/db');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;

function publicUser(user) {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function startSession(req, res, next, user, statusCode) {
  // Regenerate the session on login/registration to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = publicUser(user);
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.status(statusCode).json({ user: req.session.user });
    });
  });
}

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '').trim();

    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'Please enter your name (max 100 characters).' });
    }
    if (!EMAIL_RE.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (phone && !PHONE_RE.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid phone number (7-15 digits).' });
    }
    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be between 6 and 72 characters.' });
    }
    if (!['farmer', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Account type must be farmer or customer.' });
    }

    const [existing] = await pool.execute('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const [result] = await pool.execute(
        'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, phone || null, passwordHash, role]
      );

      return startSession(
        req,
        res,
        (err) => {
          console.error('Session error:', err);
          res.status(500).json({ error: 'Account created, but login failed. Please log in.' });
        },
        { user_id: result.insertId, name, email, role },
        201
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      throw err;
    }
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const user = rows[0];
    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    return startSession(
      req,
      res,
      (err) => {
        console.error('Session error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
      },
      user,
      200
    );
  })
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('agri.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
