/* Shop page: browse products, filter, cart drawer and checkout. */
(function () {
  'use strict';

  const state = {
    search: '',
    category: '',
    products: [],
    statsLoaded: false
  };

  const grid = document.getElementById('product-grid');
  const emptyState = document.getElementById('products-empty');
  const pills = document.getElementById('category-pills');
  const searchInput = document.getElementById('search');
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-overlay');
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  const placeOrderButton = document.getElementById('place-order');
  const addressInput = document.getElementById('delivery-address');

  let lastFocusedElement = null;

  function init() {
    // Links like shop.html?category=Fruits pre-select a category.
    state.category = new URLSearchParams(window.location.search).get('category') || '';
    bindEvents();
    renderCart();
    loadCategories();
    loadProducts();
    if (window.location.hash === '#basket') openCart();
  }

  function bindEvents() {
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        Agri.debounce(() => {
          state.search = searchInput.value.trim();
          loadProducts();
        }, 220)
      );

      // Keyboard shortcut '/' to search
      document.addEventListener('keydown', (event) => {
        if (
          event.key === '/' &&
          document.activeElement !== searchInput &&
          !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
        ) {
          event.preventDefault();
          searchInput.focus();
        }
      });
    }

    if (pills) {
      pills.addEventListener('click', (event) => {
        const button = event.target.closest('.pill');
        if (!button) return;
        state.category = button.dataset.category || '';
        pills.querySelectorAll('.pill').forEach((pill) => {
          pill.classList.toggle('active', pill === button);
        });
        loadProducts();
      });
    }

    if (grid) {
      grid.addEventListener('click', handleGridActions);
    }

    const openCartBtn = document.getElementById('open-cart');
    if (openCartBtn) openCartBtn.addEventListener('click', openCart);

    const closeCartBtn = document.getElementById('close-cart');
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);

    if (overlay) overlay.addEventListener('click', closeCart);

    if (cartItems) {
      cartItems.addEventListener('click', (event) => {
        const row = event.target.closest('.cart-item');
        if (!row) return;
        const productId = Number(row.dataset.id);
        const item = Agri.cart.get().find((entry) => entry.product_id === productId);
        if (!item) return;

        if (event.target.closest('[data-cart-inc]')) {
          Agri.cart.setQuantity(productId, item.quantity + 1);
        } else if (event.target.closest('[data-cart-dec]')) {
          Agri.cart.setQuantity(productId, item.quantity - 1);
        } else if (event.target.closest('[data-cart-remove]')) {
          Agri.cart.remove(productId);
        }
      });
    }

    if (placeOrderButton) {
      placeOrderButton.addEventListener('click', placeOrder);
    }

    // Quick address presets
    document.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-preset-address]');
      if (chip && addressInput) {
        addressInput.value = chip.dataset.presetAddress;
        addressInput.focus();
      }
    });

    window.addEventListener('cart:change', renderCart);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawer && drawer.classList.contains('open')) {
        closeCart();
      }
    });
  }

  async function loadCategories() {
    try {
      const data = await Agri.api('/api/products/categories');
      renderPills(data.categories || []);
    } catch (err) {
      renderPills([]);
    }
  }

  function renderPills(categories) {
    if (!pills) return;
    const all = `<button type="button" class="pill ${state.category === '' ? 'active' : ''}" data-category="">All harvest</button>`;
    const rest = categories
      .map((category) => {
        const isActive = state.category === category;
        return `<button type="button" class="pill ${isActive ? 'active' : ''}" data-category="${Agri.escapeHtml(
          category
        )}">${Agri.escapeHtml(category)}</button>`;
      })
      .join('');
    pills.innerHTML = all + rest;
  }

  async function loadProducts() {
    if (grid) {
      grid.innerHTML = '<p class="muted" style="grid-column:1/-1;padding:24px 0;text-align:center;">Loading products…</p>';
    }
    if (emptyState) emptyState.hidden = true;

    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.category) params.set('category', state.category);
    const query = params.toString();

    try {
      const data = await Agri.api(`/api/products${query ? `?${query}` : ''}`);
      state.products = data.products || [];
      renderProducts();

      if (!state.statsLoaded) {
        updateHeroStats();
        state.statsLoaded = true;
      }
    } catch (err) {
      if (grid) grid.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      Agri.toast(err.message, 'error');
    }
  }

  function renderProducts() {
    if (!grid) return;

    if (state.products.length === 0) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (emptyState) emptyState.hidden = false;
      return;
    }

    grid.hidden = false;
    if (emptyState) emptyState.hidden = true;

    grid.innerHTML = state.products
      .map((product) => {
        const quantity = Number(product.quantity) || 0;
        const inStock = quantity > 0;
        const isLowStock = inStock && quantity <= 25;
        const category = Agri.escapeHtml(product.category);
        const name = Agri.escapeHtml(product.product_name);
        const description = Agri.escapeHtml(
          product.description || 'Listed directly by the farmer.'
        );
        const farmer = Agri.escapeHtml(product.farmer_name);
        const price = Agri.money(product.price);
        const emoji = Agri.emojiFor(product.category);
        const photo = Agri.imageFor(product);

        let stockBadge = '';
        if (!inStock) {
          stockBadge = `<span class="stock out">Sold out</span>`;
        } else if (isLowStock) {
          stockBadge = `<span class="stock low">Only ${quantity} left</span>`;
        } else {
          stockBadge = `<span class="stock">${quantity} in stock</span>`;
        }

        return `
          <article class="product-card" data-id="${product.product_id}">
            <div class="product-thumb" data-category="${category}">
              <span class="product-thumb-emoji" aria-hidden="true">${emoji}</span>
              <img src="${photo}" alt="${name}" loading="lazy" decoding="async"
                onerror="this.remove()" />
            </div>
            <div class="product-body">
              <div class="product-top">
                <span class="badge">${category}</span>
                ${stockBadge}
              </div>
              <h3>${name}</h3>
              <p class="product-desc">${description}</p>
              <div class="farmer-tag">
                <span>Grown by <strong>${farmer}</strong></span>
              </div>
              <div class="product-foot">
                <div class="price">
                  ${price}
                </div>
                <div class="add-row">
                  <input type="number" min="1" max="${quantity}" value="1"
                    aria-label="Quantity for ${name}" ${inStock ? '' : 'disabled'} />
                  <button type="button" class="btn btn-primary btn-sm add-btn" ${inStock ? '' : 'disabled'}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          </article>`;
      })
      .join('');
  }

  function updateHeroStats() {
    const farmers = new Set(state.products.map((product) => product.farmer_name));
    const categories = new Set(state.products.map((product) => product.category));

    const statProd = document.getElementById('stat-products');
    const statFarm = document.getElementById('stat-farmers');
    const statCat = document.getElementById('stat-categories');

    if (statProd) statProd.textContent = String(state.products.length);
    if (statFarm) statFarm.textContent = String(farmers.size);
    if (statCat) statCat.textContent = String(categories.size);
  }

  function handleGridActions(event) {
    const button = event.target.closest('.add-btn');
    if (!button) return;

    const card = button.closest('.product-card');
    const product = state.products.find(
      (entry) => entry.product_id === Number(card.dataset.id)
    );
    if (!product) return;

    const input = card.querySelector('input[type="number"]');
    const requested = Math.max(1, Math.floor(Number(input.value) || 1));
    const result = Agri.cart.add(product, requested);

    if (result.added === 0) {
      Agri.toast(
        Number(product.quantity) > 0
          ? 'Your basket already has the maximum available quantity.'
          : 'This product is currently out of stock.',
        'error'
      );
      return;
    }

    if (result.added < requested) {
      Agri.toast(`Only ${result.max} available — added ${result.added} to basket.`);
    } else {
      Agri.toast(`Added ${result.added} × ${product.product_name} to basket.`);
    }
  }

  function openCart() {
    lastFocusedElement = document.activeElement;
    renderCart();
    if (overlay) overlay.classList.add('visible');
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('no-scroll');
    const closeBtn = document.getElementById('close-cart');
    if (closeBtn) closeBtn.focus();
  }

  function closeCart() {
    if (overlay) overlay.classList.remove('visible');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('no-scroll');
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function renderCart() {
    if (!cartItems || !cartTotal || !placeOrderButton) return;
    const items = Agri.cart.get();

    if (items.length === 0) {
      cartItems.innerHTML = `
        <div class="cart-empty">
          <p class="cart-empty-title">Your basket is empty</p>
          <p class="small" style="margin-top:4px;">Add something from the shop to get started.</p>
        </div>`;
      cartTotal.textContent = Agri.money(0);
      placeOrderButton.disabled = true;
      return;
    }

    placeOrderButton.disabled = false;

    cartItems.innerHTML = items
      .map((item) => {
        const max = item.max_quantity > 0 ? item.max_quantity : item.quantity;
        return `
          <div class="cart-item" data-id="${item.product_id}">
            <div class="cart-thumb" aria-hidden="true"><img src="${Agri.imageFor(item)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${Agri.emojiFor(item.category)}'))" /></div>
            <div class="cart-info">
              <h4>${Agri.escapeHtml(item.product_name)}</h4>
              <p class="cart-farm">${Agri.escapeHtml(item.farmer_name)}</p>
              <div class="qty-stepper">
                <button type="button" data-cart-dec aria-label="Decrease quantity" ${
                  item.quantity <= 1 ? 'disabled' : ''
                }>−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-inc aria-label="Increase quantity" ${
                  item.quantity >= max ? 'disabled' : ''
                }>+</button>
              </div>
            </div>
            <div class="cart-line">
              <span class="cart-line-price">${Agri.money(item.price * item.quantity)}</span>
              <button type="button" class="cart-remove" data-cart-remove>Remove</button>
            </div>
          </div>`;
      })
      .join('');

    const subtotal = Agri.cart.total();
    cartTotal.textContent = Agri.money(subtotal);
  }

  async function placeOrder() {
    const items = Agri.cart.get();
    if (items.length === 0) {
      Agri.toast('Your basket is empty.', 'error');
      return;
    }

    const address = addressInput ? addressInput.value.trim() : '';
    if (address.length < 5) {
      Agri.toast('Enter a full delivery address.', 'error');
      if (addressInput) addressInput.focus();
      return;
    }

    const me = await Agri.getMe();
    if (!me) {
      Agri.toast('Log in to place your order.', 'error');
      setTimeout(() => {
        window.location.href = 'login.html?next=shop.html';
      }, 800);
      return;
    }
    if (me.role !== 'customer') {
      Agri.toast('Only customer accounts can place orders.', 'error');
      return;
    }

    const originalLabel = placeOrderButton.innerHTML;
    placeOrderButton.disabled = true;
    placeOrderButton.innerHTML = 'Placing order…';

    try {
      const data = await Agri.api('/api/orders', {
        method: 'POST',
        body: {
          items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity
          })),
          delivery_address: address
        }
      });

      Agri.cart.clear();
      if (addressInput) addressInput.value = '';
      closeCart();
      Agri.toast(
        `Order #${data.order_id} placed · ${Agri.money(data.total_amount)}`
      );
      setTimeout(() => {
        window.location.href = 'orders.html';
      }, 900);
    } catch (err) {
      Agri.toast(err.message, 'error');
      placeOrderButton.disabled = false;
      placeOrderButton.innerHTML = originalLabel;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
