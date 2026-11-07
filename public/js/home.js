/* Landing page: live stats and a few featured products. */
(function () {
  'use strict';

  const grid = document.getElementById('featured-grid');

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function card(product) {
    const name = Agri.escapeHtml(product.product_name);
    const quantity = Number(product.quantity) || 0;
    return `
      <a class="featured-card" href="shop.html?category=${encodeURIComponent(product.category)}">
        <div class="featured-media">
          <span class="product-thumb-emoji" aria-hidden="true">${Agri.emojiFor(product.category)}</span>
          <img src="${Agri.imageFor(product)}" alt="${name}" loading="lazy" onerror="this.remove()" />
        </div>
        <div class="featured-body">
          <span class="badge">${Agri.escapeHtml(product.category)}</span>
          <h3>${name}</h3>
          <p class="muted small">Grown by ${Agri.escapeHtml(product.farmer_name)}</p>
          <div class="featured-foot">
            <span class="price">${Agri.money(product.price)}</span>
            <span class="stock ${quantity === 0 ? 'out' : quantity <= 25 ? 'low' : ''}">
              ${quantity === 0 ? 'Sold out' : `${quantity} in stock`}
            </span>
          </div>
        </div>
      </a>`;
  }

  async function init() {
    try {
      const data = await Agri.api('/api/products');
      const products = data.products || [];

      setText('stat-products', String(products.length));
      setText('stat-farmers', String(new Set(products.map((p) => p.farmer_name)).size));
      setText('stat-categories', String(new Set(products.map((p) => p.category)).size));

      if (grid) {
        // One product per category first, so the row looks varied.
        const seen = new Set();
        const picks = products.filter((p) => p.quantity > 0 && !seen.has(p.category) && seen.add(p.category));
        grid.innerHTML = picks.slice(0, 4).map(card).join('');
      }
    } catch (err) {
      if (grid) grid.innerHTML = '<p class="muted">Products could not be loaded right now.</p>';
    }
  }

  init();
})();
