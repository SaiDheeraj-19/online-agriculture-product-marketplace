const express = require('express');

const pool = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function attachItems(orders, items) {
  const byOrder = new Map(orders.map((order) => [order.order_id, { ...order, items: [] }]));
  for (const item of items) {
    const order = byOrder.get(item.order_id);
    if (order) order.items.push(item);
  }
  return [...byOrder.values()];
}

// POST /api/orders - place an order (customer only)
router.post(
  '/',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const deliveryAddress = String(req.body.delivery_address || '').trim();
    const rawItems = req.body.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ error: 'Your basket is empty.' });
    }
    if (rawItems.length > 50) {
      return res.status(400).json({ error: 'An order cannot contain more than 50 different products.' });
    }
    if (deliveryAddress.length < 5 || deliveryAddress.length > 255) {
      return res.status(400).json({ error: 'Please enter a delivery address (5-255 characters).' });
    }

    // Merge duplicate product lines so stock checks stay accurate.
    const quantities = new Map();
    for (const item of rawItems) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product in basket.' });
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
        return res.status(400).json({ error: 'Each quantity must be a whole number between 1 and 999.' });
      }
      const mergedQuantity = (quantities.get(productId) || 0) + quantity;
      if (mergedQuantity > 999) {
        return res.status(400).json({ error: 'Each quantity must be between 1 and 999.' });
      }
      quantities.set(productId, mergedQuantity);
    }

    const connection = await pool.getConnection();
    let orderId;
    let totalAmount = 0;

    try {
      await connection.beginTransaction();

      const ids = [...quantities.keys()];
      const [products] = await connection.query(
        `SELECT product_id, product_name, price, quantity, farmer_id
         FROM products
         WHERE product_id IN (?)
         FOR UPDATE`,
        [ids]
      );

      if (products.length !== ids.length) {
        throw httpError(404, 'One or more products are no longer available.');
      }

      const byId = new Map(products.map((product) => [product.product_id, product]));
      const orderItems = [];

      for (const [productId, quantity] of quantities) {
        const product = byId.get(productId);
        if (product.quantity < quantity) {
          throw httpError(
            409,
            `Only ${product.quantity} unit(s) of ${product.product_name} are left in stock.`
          );
        }
        totalAmount += Number(product.price) * quantity;
        orderItems.push({
          product_id: productId,
          quantity,
          price: Number(product.price)
        });
      }

      totalAmount = Math.round(totalAmount * 100) / 100;

      const [orderResult] = await connection.execute(
        `INSERT INTO orders (customer_id, order_date, total_amount, delivery_address, status)
         VALUES (?, CURDATE(), ?, ?, ?)`,
        [req.session.user.user_id, totalAmount, deliveryAddress, 'Pending']
      );
      orderId = orderResult.insertId;

      const itemRows = orderItems.map((item) => [
        orderId,
        item.product_id,
        item.quantity,
        item.price
      ]);
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?',
        [itemRows]
      );

      for (const item of orderItems) {
        await connection.execute(
          'UPDATE products SET quantity = quantity - ? WHERE product_id = ?',
          [item.quantity, item.product_id]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.status(201).json({
      message: 'Order placed successfully.',
      order_id: orderId,
      total_amount: totalAmount
    });
  })
);

// GET /api/orders/mine - logged-in customer's order history
router.get(
  '/mine',
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const [orders] = await pool.execute(
      `SELECT order_id, customer_id, order_date, total_amount, delivery_address, status
       FROM orders
       WHERE customer_id = ?
       ORDER BY order_id DESC`,
      [req.session.user.user_id]
    );

    if (orders.length === 0) {
      return res.json({ orders: [] });
    }

    const orderIds = orders.map((order) => order.order_id);
    const [items] = await pool.query(
      `SELECT oi.order_id, oi.product_id, oi.quantity, oi.price,
              p.product_name, p.category, u.name AS farmer_name
       FROM order_items oi
       JOIN products p ON p.product_id = oi.product_id
       JOIN users u ON u.user_id = p.farmer_id
       WHERE oi.order_id IN (?)
       ORDER BY oi.item_id ASC`,
      [orderIds]
    );

    res.json({ orders: attachItems(orders, items) });
  })
);

// GET /api/orders/farmer - orders containing this farmer's products
router.get(
  '/farmer',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const farmerId = req.session.user.user_id;

    const [orders] = await pool.execute(
      `SELECT DISTINCT o.order_id, o.customer_id, o.order_date, o.total_amount,
              o.delivery_address, o.status, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON u.user_id = o.customer_id
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN products p ON p.product_id = oi.product_id
       WHERE p.farmer_id = ?
       ORDER BY o.order_id DESC`,
      [farmerId]
    );

    if (orders.length === 0) {
      return res.json({ orders: [] });
    }

    const orderIds = orders.map((order) => order.order_id);
    const [items] = await pool.query(
      `SELECT oi.order_id, oi.product_id, oi.quantity, oi.price, p.product_name
       FROM order_items oi
       JOIN products p ON p.product_id = oi.product_id
       WHERE oi.order_id IN (?) AND p.farmer_id = ?
       ORDER BY oi.item_id ASC`,
      [orderIds, farmerId]
    );

    const withItems = attachItems(orders, items).map((order) => {
      const farmerTotal = order.items.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0
      );
      return { ...order, farmer_total: Math.round(farmerTotal * 100) / 100 };
    });

    res.json({ orders: withItems });
  })
);

// PATCH /api/orders/:id/status - farmer updates status of an order they sell in
router.patch(
  '/:id/status',
  requireRole('farmer'),
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const status = String(req.body.status || '').trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id.' });
    }
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${ORDER_STATUSES.join(', ')}.`
      });
    }

    const [involved] = await pool.execute(
      `SELECT o.order_id
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.order_id
       JOIN products p ON p.product_id = oi.product_id
       WHERE o.order_id = ? AND p.farmer_id = ?
       LIMIT 1`,
      [orderId, req.session.user.user_id]
    );

    if (involved.length === 0) {
      return res.status(404).json({ error: 'Order not found for your products.' });
    }

    await pool.execute('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);

    res.json({ message: `Order #${orderId} marked as ${status}.` });
  })
);

module.exports = router;
