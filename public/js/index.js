/* Marketplace page: browse products, filter, cart drawer and checkout. */
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
    bindEvents();
    renderCart();
    loadCategories();
    loadProducts();
  }

  function bindEvents() {
    searchInput.addEventListener(
      'input',
      Agri.debounce(() => {
        state.search = searchInput.value.trim();
        loadProducts();
      }, 250)
    );

    pills.addEventListener('click', (event) => {
      const button = event.target.closest('.pill');
      if (!button) return;
      state.category = button.dataset.category || '';
      pills.querySelectorAll('.pill').forEach((pill) => {
        pill.classList.toggle('active', pill === button);
      });
      loadProducts();
    });

    grid.addEventListener('click', handleAddToCart);

    document.getElementById('open-cart').addEventListener('click', openCart);
    document.getElementById('close-cart').addEventListener('click', closeCart);
    overlay.addEventListener('click', closeCart);

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

    placeOrderButton.addEventListener('click', placeOrder);

    window.addEventListener('cart:change', renderCart);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawer.classList.contains('open')) closeCart();
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
    const all = `<button type="button" class="pill ${state.category === '' ? 'active' : ''}" data-category="">All produce</button>`;
    const rest = categories
      .map(
        (category) =>
          `<button type="button" class="pill ${
            state.category === category ? 'active' : ''
          }" data-category="${Agri.escapeHtml(category)}">${Agri.escapeHtml(category)}</button>`
      )
      .join('');
    pills.innerHTML = all + rest;
  }

  async function loadProducts() {
    grid.innerHTML =
      '<p class="muted" style="grid-column:1/-1;padding:16px 0;">Loading fresh produce…</p>';
    emptyState.hidden = true;

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
      grid.innerHTML = '';
      emptyState.hidden = false;
      Agri.toast(err.message, 'error');
    }
  }

  function renderProducts() {
    if (state.products.length === 0) {
      grid.innerHTML = '';
      grid.hidden = true;
      emptyState.hidden = false;
      return;
    }

    grid.hidden = false;
    emptyState.hidden = true;

    grid.innerHTML = state.products
      .map((product) => {
        const quantity = Number(product.quantity) || 0;
        const inStock = quantity > 0;
        const category = Agri.escapeHtml(product.category);
        const name = Agri.escapeHtml(product.product_name);
        const description = Agri.escapeHtml(
          product.description || 'Fresh from the farm, listed by a local grower.'
        );
        const farmer = Agri.escapeHtml(product.farmer_name);
        const price = Agri.money(product.price);

        return `
          <article class="product-card" data-id="${product.product_id}">
            <div class="product-thumb" data-category="${category}" aria-hidden="true">${Agri.emojiFor(
          product.category
        )}</div>
            <div class="product-body">
              <div class="product-top">
                <span class="badge">${category}</span>
                <span class="stock ${inStock ? '' : 'out'}">${
          inStock ? `${quantity} in stock` : 'Out of stock'
        }</span>
              </div>
              <h3>${name}</h3>
              <p class="product-desc">${description}</p>
              <p class="farmer">👨‍🌾 ${farmer}</p>
              <div class="product-foot">
                <div class="price">${price}<small>per unit</small></div>
                <div class="add-row">
                  <input type="number" min="1" max="${quantity}" value="1"
                    aria-label="Quantity for ${name}" ${inStock ? '' : 'disabled'} />
                  <button type="button" class="btn btn-primary btn-sm add-btn" ${
          inStock ? '' : 'disabled'
        }>Add</button>
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
    document.getElementById('stat-products').textContent = String(state.products.length);
    document.getElementById('stat-farmers').textContent = String(farmers.size);
    document.getElementById('stat-categories').textContent = String(categories.size);
  }

  function handleAddToCart(event) {
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
          : 'This product is out of stock.',
        'error'
      );
      return;
    }

    if (result.added < requested) {
      Agri.toast(`Only ${result.max} available — ${result.added} added to your basket.`);
    } else {
      Agri.toast(`${result.added} × ${product.product_name} added to your basket.`);
    }
  }

  function openCart() {
    lastFocusedElement = document.activeElement;
    renderCart();
    overlay.classList.add('visible');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    document.getElementById('close-cart').focus();
  }

  function closeCart() {
    overlay.classList.remove('visible');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function renderCart() {
    const items = Agri.cart.get();

    if (items.length === 0) {
      cartItems.innerHTML = `
        <div class="cart-empty">
          <span class="empty-emoji" aria-hidden="true">🧺</span>
          <p>Your basket is empty.</p>
          <p class="small">Add some fresh produce to get started.</p>
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
            <div class="cart-thumb" aria-hidden="true">${Agri.emojiFor(item.category)}</div>
            <div class="cart-info">
              <h4>${Agri.escapeHtml(item.product_name)}</h4>
              <p class="cart-farm">👨‍🌾 ${Agri.escapeHtml(item.farmer_name)}</p>
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

    cartTotal.textContent = Agri.money(Agri.cart.total());
  }

  async function placeOrder() {
    const items = Agri.cart.get();
    if (items.length === 0) {
      Agri.toast('Your basket is empty.', 'error');
      return;
    }

    const address = addressInput.value.trim();
    if (address.length < 5) {
      Agri.toast('Please enter a delivery address.', 'error');
      addressInput.focus();
      return;
    }

    const me = await Agri.getMe();
    if (!me) {
      Agri.toast('Please log in as a customer to place your order.', 'error');
      setTimeout(() => {
        window.location.href = 'login.html?next=index.html';
      }, 800);
      return;
    }
    if (me.role !== 'customer') {
      Agri.toast('Only customer accounts can place orders.', 'error');
      return;
    }

    const originalLabel = placeOrderButton.textContent;
    placeOrderButton.disabled = true;
    placeOrderButton.textContent = 'Placing order…';

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
      addressInput.value = '';
      closeCart();
      Agri.toast(
        `Order #${data.order_id} placed successfully — ${Agri.money(data.total_amount)}.`
      );
      setTimeout(() => {
        window.location.href = 'orders.html';
      }, 900);
    } catch (err) {
      Agri.toast(err.message, 'error');
      placeOrderButton.disabled = false;
      placeOrderButton.textContent = originalLabel;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
