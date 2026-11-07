/* Customer order history with live timeline tracking. */
(function () {
  'use strict';

  const list = document.getElementById('orders-list');
  const emptyState = document.getElementById('orders-empty');

  const STEP_INDEX = {
    Pending: 1,
    Confirmed: 2,
    Shipped: 3,
    Delivered: 4,
    Cancelled: -1
  };

  function init() {
    const me = Agri.requireRole('customer');
    me.then((user) => {
      if (!user) return;
      loadOrders();
    });
  }

  async function loadOrders() {
    list.innerHTML = '<p class="muted center" style="padding:40px 0;">Retrieving your orders…</p>';

    try {
      const data = await Agri.api('/api/orders/mine');
      render(data.orders || []);
    } catch (err) {
      list.innerHTML = '';
      Agri.toast(err.message, 'error');
    }
  }

  function renderTracker(status) {
    const step = STEP_INDEX[status] || 1;

    if (status === 'Cancelled') {
      return `
        <div style="background:var(--danger-bg);color:var(--danger);padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;margin:12px 0 16px;">
          This order was cancelled.
        </div>`;
    }

    return `
      <div class="order-tracker" aria-label="Order progress: ${status}">
        <div class="tracker-step ${step >= 1 ? (step > 1 ? 'completed' : 'active') : ''}">
          <div class="tracker-dot">${step > 1 ? '✓' : '1'}</div>
          <span class="tracker-label">Placed</span>
        </div>
        <div class="tracker-step ${step >= 2 ? (step > 2 ? 'completed' : 'active') : ''}">
          <div class="tracker-dot">${step > 2 ? '✓' : '2'}</div>
          <span class="tracker-label">Confirmed</span>
        </div>
        <div class="tracker-step ${step >= 3 ? (step > 3 ? 'completed' : 'active') : ''}">
          <div class="tracker-dot">${step > 3 ? '✓' : '3'}</div>
          <span class="tracker-label">Shipped</span>
        </div>
        <div class="tracker-step ${step >= 4 ? 'completed active' : ''}">
          <div class="tracker-dot">${step >= 4 ? '✓' : '4'}</div>
          <span class="tracker-label">Delivered</span>
        </div>
      </div>
    `;
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
                <div style="display:flex;align-items:center;gap:10px;">
                  <h3 class="mono">Order #${order.order_id}</h3>
                  <span class="status status-${statusClass}">${Agri.escapeHtml(order.status)}</span>
                </div>
                <p class="order-meta">Harvest ordered on ${Agri.formatDate(order.order_date)}</p>
              </div>
              <div class="order-total">${Agri.money(order.total_amount)}</div>
            </div>

            ${renderTracker(order.status)}

            <div class="order-items">${items}</div>

            <div class="order-foot">
              <p class="order-address">Delivering to <strong>${Agri.escapeHtml(order.delivery_address)}</strong></p>
              <span class="mono small muted">Same-day Farm Dispatch</span>
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
