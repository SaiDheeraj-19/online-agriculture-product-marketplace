/* Farmer dashboard: manage listings, stock and incoming orders. */
(function () {
  'use strict';

  const STATUSES = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

  const productsBody = document.getElementById('products-body');
  const farmerOrders = document.getElementById('farmer-orders');
  const modal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  const productError = document.getElementById('product-error');
  const modalTitle = document.getElementById('modal-title');
  const submitButton = document.getElementById('product-submit');

  let products = [];
  let orders = [];

  function init() {
    const me = Agri.requireRole('farmer');
    me.then((user) => {
      if (!user) return;
      bindEvents();
      loadAll();
    });
  }

  function bindEvents() {
    document.getElementById('add-product-btn').addEventListener('click', () => openModal());

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    productForm.addEventListener('submit', saveProduct);

    productsBody.addEventListener('click', handleProductAction);
    farmerOrders.addEventListener('change', handleStatusChange);
  }

  async function loadAll() {
    await Promise.all([loadProducts(), loadOrders()]);
    renderStats();
  }

  async function loadProducts() {
    try {
      const data = await Agri.api('/api/products/mine');
      products = data.products || [];
      renderProducts();
    } catch (err) {
      Agri.toast(err.message, 'error');
    }
  }

  async function loadOrders() {
    try {
      const data = await Agri.api('/api/orders/farmer');
      orders = data.orders || [];
      renderOrders();
    } catch (err) {
      Agri.toast(err.message, 'error');
    }
  }

  function renderProducts() {
    document.getElementById('products-count').textContent = `${products.length} listing${
      products.length === 1 ? '' : 's'
    }`;

    if (products.length === 0) {
      productsBody.innerHTML = `
        <tr>
          <td colspan="5" class="muted center" style="padding:34px 12px;">
            No products yet. Click “Add product” to create your first listing.
          </td>
        </tr>`;
      return;
    }

    productsBody.innerHTML = products
      .map((product) => {
        const quantity = Number(product.quantity) || 0;
        const stockClass = quantity === 0 ? 'zero' : quantity < 10 ? 'low' : '';
        const stockLabel = quantity === 0 ? 'Out of stock' : `${quantity} units`;
        const snippet = product.description
          ? `${product.description.slice(0, 46)}${product.description.length > 46 ? '…' : ''}`
          : 'No description';

        return `
          <tr>
            <td>
              <div class="table-product">
                <span class="mini-thumb" aria-hidden="true">${Agri.emojiFor(product.category)}</span>
                <span>
                  <strong>${Agri.escapeHtml(product.product_name)}</strong>
                  <small>${Agri.escapeHtml(snippet)}</small>
                </span>
              </div>
            </td>
            <td><span class="badge">${Agri.escapeHtml(product.category)}</span></td>
            <td>${Agri.money(product.price)}</td>
            <td><span class="stock-pill ${stockClass}">${stockLabel}</span></td>
            <td>
              <div class="table-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-edit="${product.product_id}">Edit</button>
                <button type="button" class="btn btn-danger btn-sm" data-delete="${product.product_id}">Delete</button>
              </div>
            </td>
          </tr>`;
      })
      .join('');
  }

  function renderOrders() {
    document.getElementById('orders-count').textContent = `${orders.length} order${
      orders.length === 1 ? '' : 's'
    }`;

    if (orders.length === 0) {
      farmerOrders.innerHTML = `
        <div class="empty-state" style="border:none;padding:34px 16px;">
          <span class="empty-emoji" aria-hidden="true">📦</span>
          <h3>No orders yet</h3>
          <p>When a customer orders your produce, it will appear here.</p>
        </div>`;
      return;
    }

    farmerOrders.innerHTML = orders
      .map((order) => {
        const status = STATUSES.includes(order.status) ? order.status : 'Pending';
        const options = STATUSES.map(
          (option) =>
            `<option value="${option}" ${option === status ? 'selected' : ''}>${option}</option>`
        ).join('');
        const phone = order.customer_phone ? ` · ${Agri.escapeHtml(order.customer_phone)}` : '';

        return `
          <div class="farmer-order">
            <div class="farmer-order-head">
              <div>
                <h3>Order #${order.order_id}</h3>
                <p class="order-meta">
                  ${Agri.formatDate(order.order_date)} · ${Agri.escapeHtml(
          order.customer_name
        )}${phone}
                </p>
              </div>
              <select class="status-select" data-order-id="${order.order_id}" data-previous="${status}"
                aria-label="Status for order ${order.order_id}">
                ${options}
              </select>
            </div>
            <div class="farmer-order-items">
              ${order.items
                .map(
                  (item) =>
                    `<span class="item-chip">${Agri.escapeHtml(item.product_name)} × ${
                      item.quantity
                    }</span>`
                )
                .join('')}
            </div>
            <div class="farmer-order-foot">
              <span class="farmer-share">Your share
                <strong>${Agri.money(order.farmer_total)}</strong>
              </span>
              <span class="order-meta">📍 ${Agri.escapeHtml(order.delivery_address)}</span>
            </div>
          </div>`;
      })
      .join('');
  }

  function renderStats() {
    const totalStock = products.reduce((sum, product) => sum + (Number(product.quantity) || 0), 0);
    const revenue = orders
      .filter((order) => order.status !== 'Cancelled')
      .reduce((sum, order) => sum + (Number(order.farmer_total) || 0), 0);

    document.getElementById('stat-products').textContent = String(products.length);
    document.getElementById('stat-stock').textContent = String(totalStock);
    document.getElementById('stat-orders').textContent = String(orders.length);
    document.getElementById('stat-revenue').textContent = Agri.money(revenue);
  }

  function openModal(product) {
    productForm.reset();
    productError.hidden = true;
    productError.textContent = '';

    if (product) {
      productForm.elements.product_id.value = product.product_id;
      productForm.elements.product_name.value = product.product_name;
      productForm.elements.category.value = product.category;
      productForm.elements.price.value = product.price;
      productForm.elements.quantity.value = product.quantity;
      productForm.elements.description.value = product.description || '';
      modalTitle.textContent = 'Edit product';
      submitButton.textContent = 'Save changes';
    } else {
      productForm.elements.product_id.value = '';
      modalTitle.textContent = 'Add product';
      submitButton.textContent = 'Save product';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(() => productForm.elements.product_name.focus(), 60);
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }

  async function saveProduct(event) {
    event.preventDefault();
    productError.hidden = true;

    const productId = productForm.elements.product_id.value;
    const payload = {
      product_name: productForm.elements.product_name.value.trim(),
      category: productForm.elements.category.value.trim(),
      price: Number(productForm.elements.price.value),
      quantity: Number(productForm.elements.quantity.value),
      description: productForm.elements.description.value.trim()
    };

    const label = productId ? 'Save changes' : 'Save product';
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      const data = productId
        ? await Agri.api(`/api/products/${productId}`, { method: 'PUT', body: payload })
        : await Agri.api('/api/products', { method: 'POST', body: payload });

      Agri.toast(data.message || 'Product saved.');
      closeModal();
      await loadProducts();
      renderStats();
    } catch (err) {
      productError.textContent = err.message;
      productError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = label;
    }
  }

  async function handleProductAction(event) {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      const product = products.find(
        (entry) => entry.product_id === Number(editButton.dataset.edit)
      );
      if (product) openModal(product);
      return;
    }

    const deleteButton = event.target.closest('[data-delete]');
    if (!deleteButton) return;

    const product = products.find(
      (entry) => entry.product_id === Number(deleteButton.dataset.delete)
    );
    if (!product) return;

    if (!window.confirm(`Remove "${product.product_name}" from your listings?`)) return;

    deleteButton.disabled = true;
    try {
      const data = await Agri.api(`/api/products/${product.product_id}`, { method: 'DELETE' });
      Agri.toast(data.message || 'Product removed.');
      await loadProducts();
      renderStats();
    } catch (err) {
      Agri.toast(err.message, 'error');
      deleteButton.disabled = false;
    }
  }

  async function handleStatusChange(event) {
    const select = event.target.closest('.status-select');
    if (!select) return;

    const orderId = Number(select.dataset.orderId);
    const status = select.value;
    const previous = select.dataset.previous;

    select.disabled = true;
    try {
      const data = await Agri.api(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status }
      });
      Agri.toast(data.message || 'Order status updated.');
      await loadOrders();
      renderStats();
    } catch (err) {
      Agri.toast(err.message, 'error');
      select.value = previous;
      select.disabled = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
