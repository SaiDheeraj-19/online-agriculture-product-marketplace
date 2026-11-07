const express = require('express');

const pool = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

function parseProduct(body) {
  const productName = String(body.product_name || '').trim();
  const category = String(body.category || '').trim();
  const description = String(body.description || '').trim();
  const price = Number(body.price);
  const quantity = Number(body.quantity);

  if (!productName || productName.length > 150) {
    return { error: 'Product name is required (max 150 characters).' };
  }
  if (!category || category.length > 50) {
    return { error: 'Category is required (max 50 characters).' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Price must be a number greater than 0.' };
  }
  if (price > 99999999.99) {
    return { error: 'Price is too large.' };
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { error: 'Stock quantity must be a whole number of 0 or more.' };
  }
  if (description.length > 2000) {
    return { error: 'Description must be 2000 characters or fewer.' };
  }

  return {
    value: {
      productName,
      category,
      description,
      price: Math.round(price * 100) / 100,
      quantity
    }
  };
}

// GET /api/products?search=&category=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();

    const conditions = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      conditions.push('(p.product_name LIKE ? OR p.description LIKE ? OR p.category LIKE ? OR u.name LIKE ?)');
      params.push(like, like, like, like);
    }
    if (category) {
      conditions.push('p.category = ?');
      params.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [products] = await pool.query(
      `SELECT p.product_id, p.farmer_id, p.product_name, p.category, p.price,
              p.quantity, p.description, u.name AS farmer_name
       FROM products p
       JOIN users u ON u.user_id = p.farmer_id
       ${where}
       ORDER BY p.product_id DESC`,
      params
    );

    res.json({ products });
  })
);

// GET /api/products/categories
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT DISTINCT category FROM products ORDER BY category ASC'
    );
    res.json({ categories: rows.map((row) => row.category) });
  })
);

// GET /api/products/mine - products belonging to the logged-in farmer
router.get(
  '/mine',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const [products] = await pool.execute(
      `SELECT product_id, farmer_id, product_name, category, price, quantity, description
       FROM products
       WHERE farmer_id = ?
       ORDER BY product_id DESC`,
      [req.session.user.user_id]
    );
    res.json({ products });
  })
);

// POST /api/products - add a product (farmer only)
router.post(
  '/',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const parsed = parseProduct(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const { productName, category, description, price, quantity } = parsed.value;

    const [result] = await pool.execute(
      `INSERT INTO products (farmer_id, product_name, category, price, quantity, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.user.user_id, productName, category, price, quantity, description]
    );

    res.status(201).json({
      message: 'Product listed successfully.',
      product_id: result.insertId
    });
  })
);

// PUT /api/products/:id - update own product
router.put(
  '/:id',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const parsed = parseProduct(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const { productName, category, description, price, quantity } = parsed.value;

    const [result] = await pool.execute(
      `UPDATE products
       SET product_name = ?, category = ?, price = ?, quantity = ?, description = ?
       WHERE product_id = ? AND farmer_id = ?`,
      [productName, category, price, quantity, description, productId, req.session.user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found or you do not own it.' });
    }

    res.json({ message: 'Product updated successfully.' });
  })
);

// DELETE /api/products/:id - remove own product
router.delete(
  '/:id',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    try {
      const [result] = await pool.execute(
        'DELETE FROM products WHERE product_id = ? AND farmer_id = ?',
        [productId, req.session.user.user_id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Product not found or you do not own it.' });
      }

      res.json({ message: 'Product removed successfully.' });
    } catch (err) {
      if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
        return res.status(409).json({
          error: 'This product appears in existing orders and cannot be deleted. Set its stock to 0 to hide it instead.'
        });
      }
      throw err;
    }
  })
);

module.exports = router;
