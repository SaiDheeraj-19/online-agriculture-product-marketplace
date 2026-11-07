# Online Agriculture Product Marketplace

**AgriMart** is a full-stack marketplace that connects farmers with customers. Farmers list
agricultural products and keep prices and stock up to date; customers browse the shop and
place orders.

| Student | Details |
| --- | --- |
| **Name** | R Sai Dheeraj |
| **Roll number** | 24ATA05269 |

---

## 1. Project details (from the assignment sheet)

| Field | Details |
| --- | --- |
| **Project Title** | Online Agriculture Product Marketplace |
| **Description** | Connect farmers with customers through an online marketplace. Farmers can list agricultural products, update prices and stock. Customers can browse products and place orders. |
| **Tech stack** | HTML, CSS, JavaScript, Express.js, MySQL |

### Database tables and fields

**Table 1: `users`**

| Field | Type |
| --- | --- |
| `user_id` | INT, Primary Key |
| `name` | VARCHAR(100) |
| `email` | VARCHAR(100) |
| `phone` | VARCHAR(15) |
| `password` | VARCHAR(255) |
| `role` | VARCHAR(20) — `farmer` or `customer` |

**Table 2: `products`**

| Field | Type |
| --- | --- |
| `product_id` | INT, Primary Key |
| `farmer_id` | INT, Foreign Key → `users.user_id` |
| `product_name` | VARCHAR(150) |
| `category` | VARCHAR(50) |
| `price` | DECIMAL(10,2) |
| `quantity` | INT |
| `description` | TEXT |

**Table 3: `orders`**

| Field | Type |
| --- | --- |
| `order_id` | INT, Primary Key |
| `customer_id` | INT, Foreign Key → `users.user_id` |
| `order_date` | DATE |
| `total_amount` | DECIMAL(10,2) |
| `delivery_address` | VARCHAR(255) |
| `status` | VARCHAR(30) |

**Table 4: `order_items`**

| Field | Type |
| --- | --- |
| `item_id` | INT, Primary Key |
| `order_id` | INT, Foreign Key → `orders.order_id` |
| `product_id` | INT, Foreign Key → `products.product_id` |
| `quantity` | INT |
| `price` | DECIMAL(10,2) |

The exact schema is in [`database/schema.sql`](database/schema.sql).

---

## 2. Features

### Customers
- Register and log in with a customer account.
- Browse every product listed by local farmers.
- Search by product, category or farmer name, and filter by category.
- Add produce to a basket (persisted in `localStorage`).
- Place an order with a delivery address; stock and totals are validated on the server.
- View order history with itemised totals and live order status.

### Farmers
- Register and log in with a farmer account.
- Dashboard with listing count, units in stock, orders received and sales total.
- Add, edit and delete products; update prices and stock at any time.
- See incoming orders containing their produce, including customer contact details.
- Update an order's status: `Pending → Confirmed → Shipped → Delivered` (or `Cancelled`).

### Technical
- Session-based authentication with `express-session` and hashed passwords (`bcryptjs`).
- Role-based authorisation middleware (`farmer` / `customer`).
- Parameterised SQL queries throughout.
- Order placement runs in a MySQL transaction with row locking (`SELECT … FOR UPDATE`),
  stock validation, price snapshots in `order_items`, and automatic stock reduction.
- Responsive, framework-free frontend (HTML + CSS + vanilla JavaScript) with a landing page,
  shop, farmer information, about and credits pages.
- Product photos are hot-linked from Wikimedia Commons under their free licences
  (see `public/credits.html`).
- Friendly API error messages and a demo seed script.

---

## 3. Project structure

```
fsd agriculture/
├── config/
│   └── db.js                 # MySQL connection pool
├── database/
│   ├── schema.sql            # Database + 4 tables (exact assignment schema)
│   └── seed.js               # Demo users, products and orders
├── middleware/
│   └── auth.js               # requireAuth / requireRole
├── routes/
│   ├── auth.js               # register, login, logout, me
│   ├── products.js           # browse, categories, farmer CRUD
│   └── orders.js             # place order, customer history, farmer orders, status
├── public/
│   ├── index.html            # Landing page
│   ├── shop.html             # Shop (browse, search, basket, checkout)
│   ├── sell.html             # Information for farmers
│   ├── about.html
│   ├── credits.html          # Photo credits (Wikimedia Commons)
│   ├── login.html
│   ├── register.html
│   ├── farmer.html           # Farmer dashboard
│   ├── orders.html           # Customer order history
│   ├── css/style.css
│   └── js/
│       ├── common.js         # API helper, session, cart, photos, navigation
│       ├── home.js           # Landing page stats and featured products
│       ├── shop.js
│       ├── auth.js
│       ├── farmer.js
│       └── orders.js
├── utils/
│   └── async-handler.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

---

## 4. Setup and run

### Prerequisites
- Node.js 18 or newer
- MySQL 8 (or MariaDB 10.5+)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Create the database
```bash
mysql -u root -p < database/schema.sql
```
This creates the `agri_marketplace` database and the four required tables.

### Step 3 — Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` with your MySQL credentials:
```ini
PORT=3000
SESSION_SECRET=some-long-random-string

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=agri_marketplace
```

### Step 4 — (Optional) Load demo data
```bash
npm run seed
```
> ⚠️ The seed script **clears** the four marketplace tables before inserting demo data.
> Use it only on a development database.

Demo accounts created by the seed:

| Role | Email | Password |
| --- | --- | --- |
| Farmer | `farmer@agrimart.test` | `password123` |
| Farmer | `farmer2@agrimart.test` | `password123` |
| Customer | `customer@agrimart.test` | `password123` |

### Step 5 — Start the server
```bash
npm start
```
Open **http://localhost:3000**.

For auto-restart during development:
```bash
npm run dev
```

### Health check
```
GET http://localhost:3000/api/health
```
Returns `{ "status": "ok", "database": "connected" }` when MySQL is reachable.

---

## 5. API reference

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | Create a farmer or customer account |
| POST | `/api/auth/login` | Public | Log in and start a session |
| POST | `/api/auth/logout` | Logged in | Destroy the session |
| GET | `/api/auth/me` | Public | Current session user or `null` |
| GET | `/api/products` | Public | List products (`?search=`, `?category=`) |
| GET | `/api/products/categories` | Public | Distinct categories |
| GET | `/api/products/mine` | Farmer | The logged-in farmer's products |
| POST | `/api/products` | Farmer | Add a product |
| PUT | `/api/products/:id` | Farmer (owner) | Update name, category, price, stock, description |
| DELETE | `/api/products/:id` | Farmer (owner) | Delete a product (blocked if ordered) |
| POST | `/api/orders` | Customer | Place an order from `items[]` + `delivery_address` |
| GET | `/api/orders/mine` | Customer | Order history with items |
| GET | `/api/orders/farmer` | Farmer | Orders containing the farmer's products |
| PATCH | `/api/orders/:id/status` | Farmer | Update order status |

Example — place an order:
```json
POST /api/orders
{
  "items": [
    { "product_id": 1, "quantity": 3 },
    { "product_id": 4, "quantity": 1 }
  ],
  "delivery_address": "12 Green Park, Bengaluru, Karnataka 560001"
}
```

---

## 6. Database notes

- `products.farmer_id` references `users.user_id`; `orders.customer_id` references
  `users.user_id`; `order_items` references both `orders` and `products`.
- `order_items.price` stores the **price at the time of purchase**, so later price changes
  never alter past orders.
- Placing an order:
  1. starts a transaction,
  2. locks the selected product rows,
  3. checks available stock,
  4. calculates the total on the server,
  5. inserts the order and its items,
  6. decrements stock,
  7. commits.
  Any failure rolls the whole order back.
- A product that already appears in an order cannot be deleted (foreign-key protection);
  set its stock to `0` to stop selling it instead.

---

## 7. Source code

The project is hosted on GitHub: <https://github.com/SaiDheeraj-19/online-agriculture-product-marketplace>

```bash
git clone https://github.com/SaiDheeraj-19/online-agriculture-product-marketplace.git
```

`.gitignore` excludes `node_modules/`, `.env`, the local SQLite database files and OS files.

---

## 8. Assignment checklist

- [x] HTML pages
- [x] CSS styling (responsive)
- [x] JavaScript frontend logic
- [x] Express.js backend
- [x] MySQL database with the four required tables
- [x] Farmers can list products, update prices and stock
- [x] Customers can browse products and place orders
- [x] Author name and roll number in the README
- [x] Push the project to Git

---

## 9. Production notes

This project is built for a college mini-project. For production you would also:
- use a persistent session store (e.g. `express-mysql-session`) instead of the in-memory store,
- serve over HTTPS and set `cookie.secure = true`,
- add CSRF protection and rate limiting on auth routes,
- add payment integration and email/SMS notifications,
- use environment-specific CORS and database migration tooling.
