-- ============================================================
-- Online Agriculture Product Marketplace
-- MySQL schema
--
-- Import with:
--   mysql -u root -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS agri_marketplace
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agri_marketplace;

-- Drop in dependency order so the script can be re-run safely.
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- ------------------------------------------------------------
-- Table 1: users
-- ------------------------------------------------------------
CREATE TABLE users (
  user_id  INT           NOT NULL AUTO_INCREMENT,
  name     VARCHAR(100)  NOT NULL,
  email    VARCHAR(100)  NOT NULL,
  phone    VARCHAR(15)   NULL,
  password VARCHAR(255)  NOT NULL,
  role     VARCHAR(20)   NOT NULL DEFAULT 'customer',
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT chk_users_role CHECK (role IN ('farmer', 'customer'))
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Table 2: products
-- ------------------------------------------------------------
CREATE TABLE products (
  product_id   INT            NOT NULL AUTO_INCREMENT,
  farmer_id    INT            NOT NULL,
  product_name VARCHAR(150)   NOT NULL,
  category     VARCHAR(50)    NOT NULL,
  price        DECIMAL(10, 2) NOT NULL,
  quantity     INT            NOT NULL DEFAULT 0,
  description  TEXT           NULL,
  PRIMARY KEY (product_id),
  KEY idx_products_farmer (farmer_id),
  KEY idx_products_category (category),
  CONSTRAINT fk_products_farmer
    FOREIGN KEY (farmer_id) REFERENCES users (user_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_products_price CHECK (price >= 0),
  CONSTRAINT chk_products_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Table 3: orders
-- ------------------------------------------------------------
CREATE TABLE orders (
  order_id         INT            NOT NULL AUTO_INCREMENT,
  customer_id      INT            NOT NULL,
  order_date       DATE           NOT NULL,
  total_amount     DECIMAL(10, 2) NOT NULL,
  delivery_address VARCHAR(255)   NOT NULL,
  status           VARCHAR(30)    NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (order_id),
  KEY idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES users (user_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_orders_total CHECK (total_amount >= 0),
  CONSTRAINT chk_orders_status
    CHECK (status IN ('Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'))
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Table 4: order_items
-- ------------------------------------------------------------
CREATE TABLE order_items (
  item_id    INT            NOT NULL AUTO_INCREMENT,
  order_id   INT            NOT NULL,
  product_id INT            NOT NULL,
  quantity   INT            NOT NULL,
  price      DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (item_id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (product_id),
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_order_items_price CHECK (price >= 0)
) ENGINE=InnoDB;
