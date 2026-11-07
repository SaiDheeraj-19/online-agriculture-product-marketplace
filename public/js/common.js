/* Shared helpers for every page: API calls, session state, cart and UI bits. */
(function () {
  'use strict';

  const CART_KEY = 'agri_marketplace_cart_v1';
  const CATEGORY_EMOJI = {
    Vegetables: '🥬',
    Fruits: '🥭',
    Grains: '🌾',
    Dairy: '🥛',
    Pulses: '🫘',
    Spices: '🌶️'
  };

  async function api(path, options = {}) {
    const { method = 'GET', body } = options;
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }

    if (!response.ok) {
      throw new Error((data && data.error) || `Request failed (${response.status}).`);
    }
    return data;
  }

  let mePromise = null;

  function getMe(force = false) {
    if (!mePromise || force) {
      mePromise = api('/api/auth/me')
        .then((data) => data.user)
        .catch(() => null);
    }
    return mePromise;
  }

  function money(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(
      /[&<>"']/g,
      (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
    );
  }

  function formatDate(value) {
    if (!value) return '';
    const raw = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function emojiFor(category) {
    return CATEGORY_EMOJI[category] || '🧺';
  }

  function debounce(fn, delay = 250) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function toast(message, type = 'success') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }

    const element = document.createElement('div');
    element.className = `toast toast-${type === 'error' ? 'error' : 'success'}`;
    element.innerHTML = `<span aria-hidden="true">${type === 'error' ? '⚠️' : '✅'}</span><span>${escapeHtml(
      message
    )}</span>`;
    stack.appendChild(element);

    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transition = 'opacity .25s ease';
      setTimeout(() => element.remove(), 260);
    }, 3600);
  }

  /* ---------- Cart (stored in localStorage) ---------- */

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => ({
          product_id: Number(item.product_id),
          product_name: String(item.product_name || ''),
          category: String(item.category || ''),
          farmer_name: String(item.farmer_name || ''),
          price: Number(item.price) || 0,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          max_quantity: Math.max(0, Math.floor(Number(item.max_quantity) || 0))
        }))
        .filter((item) => Number.isInteger(item.product_id) && item.product_id > 0);
    } catch (err) {
      return [];
    }
  }

  function updateCartBadge() {
    const count = readCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach((element) => {
      element.textContent = String(count);
    });
  }

  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartBadge();
    window.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
  }

  const cart = {
    get: readCart,

    add(product, quantity) {
      const amount = Math.max(1, Math.floor(Number(quantity) || 1));
      const max = Math.max(0, Math.floor(Number(product.quantity) || 0));
      if (max === 0) return { added: 0, max: 0 };

      const items = readCart();
      const existing = items.find((item) => item.product_id === Number(product.product_id));
      const current = existing ? existing.quantity : 0;
      const next = Math.min(current + amount, max);
      const added = next - current;
      if (added <= 0) return { added: 0, max };

      if (existing) {
        existing.quantity = next;
        existing.max_quantity = max;
        existing.price = Number(product.price) || existing.price;
        existing.product_name = product.product_name || existing.product_name;
        existing.farmer_name = product.farmer_name || existing.farmer_name;
        existing.category = product.category || existing.category;
      } else {
        items.push({
          product_id: Number(product.product_id),
          product_name: product.product_name,
          category: product.category,
          farmer_name: product.farmer_name,
          price: Number(product.price) || 0,
          quantity: next,
          max_quantity: max
        });
      }

      writeCart(items);
      return { added, max };
    },

    setQuantity(productId, quantity) {
      const items = readCart();
      const item = items.find((entry) => entry.product_id === Number(productId));
      if (!item) return;
      const max = item.max_quantity > 0 ? item.max_quantity : Infinity;
      item.quantity = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), max);
      writeCart(items);
    },

    remove(productId) {
      writeCart(readCart().filter((item) => item.product_id !== Number(productId)));
    },

    clear() {
      writeCart([]);
    },

    count() {
      return readCart().reduce((sum, item) => sum + item.quantity, 0);
    },

    total() {
      return readCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
    }
  };

  /* ---------- Header / session ---------- */

  function renderAuthNav(me) {
    const nav = document.getElementById('auth-nav');
    if (!nav) return;

    if (me) {
      const firstName = String(me.name || '').split(' ')[0] || 'there';
      nav.innerHTML = `
        <span class="user-chip" title="${escapeHtml(me.email)}">Hi, ${escapeHtml(firstName)}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-logout>Log out</button>`;
    } else {
      nav.innerHTML = `
        <a class="btn btn-ghost btn-sm" href="login.html">Log in</a>
        <a class="btn btn-primary btn-sm" href="register.html">Sign up</a>`;
    }
  }

  async function initHeader() {
    document.querySelectorAll('[data-year]').forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });

    updateCartBadge();

    const me = await getMe();
    renderAuthNav(me);

    document.querySelectorAll('[data-role-only]').forEach((element) => {
      element.hidden = !me || me.role !== element.dataset.roleOnly;
    });
  }

  document.addEventListener('click', async (event) => {
    const logoutButton = event.target.closest('[data-logout]');
    if (!logoutButton) return;

    event.preventDefault();
    logoutButton.disabled = true;
    try {
      await api('/api/auth/logout', { method: 'POST' });
      mePromise = null;
      window.location.href = 'index.html';
    } catch (err) {
      toast(err.message, 'error');
      logoutButton.disabled = false;
    }
  });

  async function requireRole(role, loginPage = 'login.html') {
    const me = await getMe();

    if (!me) {
      const current = window.location.pathname.split('/').pop() || 'index.html';
      window.location.href = `${loginPage}?next=${encodeURIComponent(current)}`;
      return null;
    }

    if (role && me.role !== role) {
      toast(`This page is for ${role} accounts.`, 'error');
      setTimeout(() => {
        window.location.href = me.role === 'farmer' ? 'farmer.html' : 'index.html';
      }, 900);
      return null;
    }

    return me;
  }

  window.Agri = {
    api,
    getMe,
    money,
    escapeHtml,
    formatDate,
    emojiFor,
    debounce,
    toast,
    cart,
    requireRole,
    updateCartBadge
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
})();
