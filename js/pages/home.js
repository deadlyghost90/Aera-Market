import { api } from '../core/api.js';
import { mountShell, money, label } from '../core/shell.js';
import { renderGrid, showSkeletons } from '../core/catalog.js';

await mountShell('/index.html');

const grid = document.getElementById('featured-grid');
const chips = document.getElementById('category-chips');
const marquee = document.getElementById('category-marquee');
const stack = document.getElementById('hero-stack');
const searchForm = document.getElementById('hero-search');
const searchInput = document.getElementById('hero-search-input');

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const term = searchInput.value.trim();
  window.location.assign(term ? `/explore.html?q=${encodeURIComponent(term)}` : '/explore.html');
});

showSkeletons(grid, 6);

try {
  const [products, categories] = await Promise.all([
    api('/api/products?limit=8'),
    api('/api/categories')
  ]);

  renderGrid(grid, products, 'No products are live yet. The first approved item will appear here.');

  document.getElementById('stat-categories').textContent = String(categories.length);

  for (const category of categories) {
    const chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = `/explore.html?category=${encodeURIComponent(category.id)}`;
    chip.textContent = category.name;
    chips.append(chip);
  }

  // Marquee: duplicate the list so the loop is seamless.
  const items = categories.length > 0 ? categories : [];
  for (const pass of [0, 1]) {
    for (const category of items) {
      const item = document.createElement('span');
      item.className = 'marquee-item';
      item.textContent = category.name;
      marquee.append(item);
    }
    if (pass === 0 && items.length > 0) {
      const gap = document.createElement('span');
      gap.className = 'marquee-item';
      gap.textContent = pass === 0 ? '·' : '';
      marquee.append(gap);
    }
  }

  // Hero stack: the three newest approved products.
  if (products.length > 0) {
    stack.replaceChildren();
    for (const product of products.slice(0, 3)) {
      const card = document.createElement('div');
      card.className = 'stack-card';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (product.previewUrl) {
        const img = document.createElement('img');
        img.src = product.previewUrl;
        img.alt = '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        thumb.append(img);
      }

      const body = document.createElement('div');
      body.className = 'body';
      const name = document.createElement('strong');
      name.textContent = product.title;
      const price = document.createElement('span');
      price.textContent = money(product.priceMinor, product.currency);
      body.append(name, price);

      card.append(thumb, body);
      stack.append(card);
    }
  } else {
    stack.replaceChildren();
    const card = document.createElement('div');
    card.className = 'stack-card';
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const body = document.createElement('div');
    body.className = 'body';
    const name = document.createElement('strong');
    name.textContent = 'The first listing lands here';
    const meta = document.createElement('span');
    meta.textContent = label('soon');
    body.append(name, meta);
    card.append(thumb, body);
    stack.append(card);
  }
} catch (error) {
  renderGrid(grid, [], error.message || 'Could not load the catalogue.');
}
