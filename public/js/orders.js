/* Customer order history. */
(function () {
  'use strict';

  const list = document.getElementById('orders-list');
  const emptyState = document.getElementById('orders-empty');

  function init() {
    const me = Agri.requireRole('customer');
    me.then((user) => {
      if (!user) return;
      loadOrders();
    });
  }

  async function loadOrders() {
    list.innerHTML = '<p class="muted">Loading your orders…</p>';

    try {
      const data = await Agri.api('/api/orders/mine');
      render(data.orders || []);
    } catch (err) {
      list.innerHTML = '';
      Agri.toast(err.message, 'error');
    }
  }

  function render(orders) {
    if (orders.length === 0) {
      list.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    list.innerHTML = orders
      .map((order) => {
        const statusClass = String(order.status || 'Pending')
          .toLowerCase()
          .replace(/[^a-z]/g, '');
        const items = (order.items || [])
          .map(
            (item) => `
              <div class="order-item">
                <span class="item-name">
                  ${Agri.escapeHtml(item.product_name)}
                  <span class="item-price">${item.quantity} × ${Agri.money(
              item.price
            )} · ${Agri.escapeHtml(item.farmer_name)}</span>
                </span>
                <span class="item-total">${Agri.money(item.price * item.quantity)}</span>
              </div>`
          )
          .join('');

        return `
          <article class="order-card">
            <div class="order-head">
              <div>
                <h3>Order #${order.order_id}</h3>
                <p class="order-meta">Placed on ${Agri.formatDate(order.order_date)}</p>
              </div>
              <span class="status status-${statusClass}">${Agri.escapeHtml(order.status)}</span>
            </div>
            <div class="order-items">${items}</div>
            <div class="order-foot">
              <p class="order-address">📍 ${Agri.escapeHtml(order.delivery_address)}</p>
              <p class="order-total">${Agri.money(order.total_amount)}</p>
            </div>
          </article>`;
      })
      .join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
