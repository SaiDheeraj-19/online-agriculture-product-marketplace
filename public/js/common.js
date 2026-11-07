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


  /* Photos are hot-linked from Wikimedia Commons (credits in credits.html). */
  const WM = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/';
  const PHOTOS = {
    tomatoes: WM + '4/43/DSCF0614_Vibrant_ripe_tomatoes_and_fresh_carrots_piled_in_pink_market_baskets_glowing_under_bright_market_lights.jpg/1280px-DSCF0614_Vibrant_ripe_tomatoes_and_fresh_carrots_piled_in_pink_market_baskets_glowing_under_bright_market_lights.jpg',
    spinach: WM + '8/8f/Spinach_leafs.jpg/1280px-Spinach_leafs.jpg',
    potatoes: WM + '4/4a/Solanales_-_Solanum_tuberosum_-_3.jpg/1280px-Solanales_-_Solanum_tuberosum_-_3.jpg',
    rice: WM + 'e/e2/Long_grain_rice.jpg/1280px-Long_grain_rice.jpg',
    flour: WM + '6/64/All-Purpose_Flour_%284107895947%29.jpg/1280px-All-Purpose_Flour_%284107895947%29.jpg',
    milk: WM + '3/30/Glass_milk_bottle_cardboard_cap_and_opener.jpg/1280px-Glass_milk_bottle_cardboard_cap_and_opener.jpg',
    eggs: WM + 'd/df/Spotted_Brown_Chicken_Eggs_%285719609727%29.jpg/1280px-Spotted_Brown_Chicken_Eggs_%285719609727%29.jpg',
    mangoes: WM + '7/74/Mangos_-_single_and_halved.jpg/1280px-Mangos_-_single_and_halved.jpg',
    bananas: WM + 'a/a9/Bunch_of_bananas_on_sale.jpg/1280px-Bunch_of_bananas_on_sale.jpg',
    dal: WM + 'a/a2/Tur_Dal.JPG/1280px-Tur_Dal.JPG',
    turmeric: WM + 'f/f0/Turmeric_Powder_on_a_Spoon_-_Black_Background.jpg/1280px-Turmeric_Powder_on_a_Spoon_-_Black_Background.jpg',
    chillies: WM + '3/3d/Green_chillies_Kerala.jpg/1280px-Green_chillies_Kerala.jpg',
    paddies: WM + 'f/f7/Apatani_Rice_Paddies.jpg/1280px-Apatani_Rice_Paddies.jpg',
    village: WM + '4/47/Indian_Village_Sakrura.jpg/1280px-Indian_Village_Sakrura.jpg',
    peppers: WM + 'b/b1/Fresh_red_peppers_displayed_at_a_local_farm.jpg/1280px-Fresh_red_peppers_displayed_at_a_local_farm.jpg',
    sunrise: WM + '6/60/D%C3%BClmen%2C_Hausd%C3%BClmen%2C_Wallgarten_--_2015_--_0223-7.jpg/1280px-D%C3%BClmen%2C_Hausd%C3%BClmen%2C_Wallgarten_--_2015_--_0223-7.jpg',
    wheat: WM + '2/24/Ears_of_wheat_at_dusk_%28Unsplash%29.jpg/1280px-Ears_of_wheat_at_dusk_%28Unsplash%29.jpg',
    vendor: WM + '7/70/Street_vegetable_vendor_in_India.jpg/1280px-Street_vegetable_vendor_in_India.jpg'
  };

  // Match a product to a photo by name first, then by category.
  const NAME_PHOTO = [
    [/tomato/i, 'tomatoes'], [/spinach|palak/i, 'spinach'], [/potato/i, 'potatoes'],
    [/rice|basmati/i, 'rice'], [/wheat|flour|atta/i, 'flour'], [/milk/i, 'milk'],
    [/egg/i, 'eggs'], [/mango/i, 'mangoes'], [/banana/i, 'bananas'],
    [/dal|lentil|pulse|gram/i, 'dal'], [/turmeric|haldi/i, 'turmeric'], [/chill?i/i, 'chillies']
  ];
  const CATEGORY_PHOTO = {
    Vegetables: 'tomatoes', Fruits: 'mangoes', Grains: 'wheat',
    Dairy: 'milk', Pulses: 'dal', Spices: 'turmeric'
  };

  function imageFor(product) {
    const name = String((product && product.product_name) || '');
    const hit = NAME_PHOTO.find(([pattern]) => pattern.test(name));
    const key = hit ? hit[1] : CATEGORY_PHOTO[product && product.category] || 'peppers';
    return PHOTOS[key];
  }

  function initBackToTop() {
    if (document.querySelector('.to-top')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(button);
    const update = () => button.classList.toggle('visible', window.scrollY > 600);
    window.addEventListener('scroll', update, { passive: true });
    update();
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
    element.innerHTML = `<span>${escapeHtml(message)}</span>`;
    stack.appendChild(element);

    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(10px) scale(0.95)';
      element.style.transition = 'all .25s ease';
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
      element.style.transform = 'scale(1.25)';
      setTimeout(() => {
        element.style.transform = 'scale(1)';
      }, 200);
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
      const initial = (firstName[0] || 'U').toUpperCase();
      nav.innerHTML = `
        <span class="user-chip" title="${escapeHtml(me.email)} (${escapeHtml(me.role)})">
          <span class="user-avatar-initial">${escapeHtml(initial)}</span>
          <span>Hi, ${escapeHtml(firstName)}</span>
        </span>
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

    // Highlight active nav link
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav .nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href === currentPath || (currentPath === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });

    const me = await getMe();
    renderAuthNav(me);

    document.querySelectorAll('[data-role-only]').forEach((element) => {
      element.hidden = !me || me.role !== element.dataset.roleOnly;
    });

    initBackToTop();
    initMobileNav();
    initHeaderScroll();
    initReveal();
  }

  function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });
  }

  // The home page header sits on the hero photo until you scroll.
  function initHeaderScroll() {
    const header = document.querySelector('.site-header--overlay');
    if (!header) return;
    const update = () => header.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -60px 0px' }
    );
    items.forEach((item) => observer.observe(item));
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
        window.location.href = me.role === 'farmer' ? 'farmer.html' : 'shop.html';
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
    updateCartBadge,
    imageFor,
    PHOTOS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeader);
  } else {
    initHeader();
  }
})();
