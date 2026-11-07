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
    const addBtn = document.getElementById('add-product-btn');
    if (addBtn) addBtn.addEventListener('click', () => openModal());

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', closeModal);
    });

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
    });

    if (productForm) productForm.addEventListener('submit', saveProduct);

    if (productsBody) productsBody.addEventListener('click', handleProductAction);
    if (farmerOrders) farmerOrders.addEventListener('change', handleStatusChange);
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
    const countEl = document.getElementById('products-count');
    if (countEl) {
      countEl.textContent = `${products.length} listing${products.length === 1 ? '' : 's'} managed`;
    }

    if (!productsBody) return;

    if (products.length === 0) {
      productsBody.innerHTML = `
        <tr>
          <td colspan="5" class="muted center" style="padding:48px 16px;">
            <strong style="color:var(--forest-950);font-size:16px;">No produce listed yet</strong>
            <p class="small" style="margin-top:4px;">Use “Add product” to create your first listing.</p>
          </td>
        </tr>`;
      return;
    }

    productsBody.innerHTML = products
      .map((product) => {
        const quantity = Number(product.quantity) || 0;
        const stockClass = quantity === 0 ? 'zero' : quantity < 20 ? 'low' : '';
        const stockLabel = quantity === 0 ? 'Out of Stock' : `${quantity} in stock`;
        const snippet = product.description
          ? `${product.description.slice(0, 52)}${product.description.length > 52 ? '…' : ''}`
          : 'Farm-fresh harvest';

        return `
          <tr>
            <td>
              <div class="table-product">
                <span class="mini-thumb" aria-hidden="true"><img src="${Agri.imageFor(product)}" alt="" loading="lazy" onerror="this.remove()" /></span>
                <span>
                  <strong>${Agri.escapeHtml(product.product_name)}</strong>
                  <small>${Agri.escapeHtml(snippet)}</small>
                </span>
              </div>
            </td>
            <td><span class="badge">${Agri.escapeHtml(product.category)}</span></td>
            <td><strong style="font-family:var(--font-mono);font-size:15px;color:var(--forest-950);">${Agri.money(product.price)}</strong></td>
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
    const countEl = document.getElementById('orders-count');
    if (countEl) {
      countEl.textContent = `${orders.length} customer order${orders.length === 1 ? '' : 's'}`;
    }

    if (!farmerOrders) return;

    if (orders.length === 0) {
      farmerOrders.innerHTML = `
        <div class="empty-state" style="border:none;padding:48px 16px;">
          <h3>No customer orders yet</h3>
          <p>Orders that include your produce will show up here.</p>
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
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="mono" style="font-weight:800;color:var(--forest-950);font-size:16px;">Order #${order.order_id}</span>
                  <span class="status status-${status.toLowerCase()}">${status}</span>
                </div>
                <p class="order-meta">
                  ${Agri.formatDate(order.order_date)} · <strong>${Agri.escapeHtml(order.customer_name)}</strong>${phone}
                </p>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;font-weight:700;color:var(--muted);">Update Status:</span>
                <select class="status-select" data-order-id="${order.order_id}" data-previous="${status}"
                  aria-label="Status for order ${order.order_id}">
                  ${options}
                </select>
              </div>
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
              <span class="farmer-share">Your Farm Payout:
                <strong>${Agri.money(order.farmer_total)}</strong>
              </span>
              <span class="order-meta">${Agri.escapeHtml(order.delivery_address)}</span>
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

    const statProd = document.getElementById('stat-products');
    const statStock = document.getElementById('stat-stock');
    const statOrd = document.getElementById('stat-orders');
    const statRev = document.getElementById('stat-revenue');

    if (statProd) statProd.textContent = String(products.length);
    if (statStock) statStock.textContent = String(totalStock);
    if (statOrd) statOrd.textContent = String(orders.length);
    if (statRev) statRev.textContent = Agri.money(revenue);
  }

  function openModal(product) {
    if (!productForm || !modalTitle || !submitButton || !modal) return;
    productForm.reset();
    if (productError) {
      productError.hidden = true;
      productError.textContent = '';
    }

    if (product) {
      productForm.elements.product_id.value = product.product_id;
      productForm.elements.product_name.value = product.product_name;
      productForm.elements.category.value = product.category;
      productForm.elements.price.value = product.price;
      productForm.elements.quantity.value = product.quantity;
      productForm.elements.description.value = product.description || '';
      modalTitle.textContent = 'Edit Produce Listing';
      submitButton.textContent = 'Save Changes';
    } else {
      productForm.elements.product_id.value = '';
      modalTitle.textContent = 'List New Produce';
      submitButton.textContent = 'List Produce';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(() => {
      if (productForm.elements.product_name) productForm.elements.product_name.focus();
    }, 60);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (productError) productError.hidden = true;

    const productId = productForm.elements.product_id.value;
    const payload = {
      product_name: productForm.elements.product_name.value.trim(),
      category: productForm.elements.category.value.trim(),
      price: Number(productForm.elements.price.value),
      quantity: Number(productForm.elements.quantity.value),
      description: productForm.elements.description.value.trim()
    };

    const label = productId ? 'Save Changes' : 'List Produce';
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      const data = productId
        ? await Agri.api(`/api/products/${productId}`, { method: 'PUT', body: payload })
        : await Agri.api('/api/products', { method: 'POST', body: payload });

      Agri.toast(data.message || 'Produce listing updated successfully.');
      closeModal();
      await loadProducts();
      renderStats();
    } catch (err) {
      if (productError) {
        productError.textContent = err.message;
        productError.hidden = false;
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = label;
    }
  }

  async function handleProductAction(event) {
    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) {
      const id = Number(editBtn.dataset.edit);
      const product = products.find((entry) => entry.product_id === id);
      if (product) openModal(product);
      return;
    }

    const deleteBtn = event.target.closest('[data-delete]');
    if (deleteBtn) {
      const id = Number(deleteBtn.dataset.delete);
      const product = products.find((entry) => entry.product_id === id);
      const name = product ? product.product_name : 'this product';
      if (!window.confirm(`Are you sure you want to remove "${name}" from the marketplace?`)) {
        return;
      }

      deleteBtn.disabled = true;
      try {
        await Agri.api(`/api/products/${id}`, { method: 'DELETE' });
        Agri.toast(`"${name}" removed from marketplace.`);
        await loadProducts();
        renderStats();
      } catch (err) {
        Agri.toast(err.message, 'error');
        deleteBtn.disabled = false;
      }
    }
  }

  async function handleStatusChange(event) {
    const select = event.target.closest('.status-select');
    if (!select) return;

    const orderId = Number(select.dataset.orderId);
    const nextStatus = select.value;
    const previous = select.dataset.previous;

    select.disabled = true;
    try {
      await Agri.api(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status: nextStatus }
      });
      select.dataset.previous = nextStatus;
      Agri.toast(`Order #${orderId} marked as ${nextStatus}.`);
      await loadOrders();
      renderStats();
    } catch (err) {
      Agri.toast(err.message, 'error');
      select.value = previous;
    } finally {
      select.disabled = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
