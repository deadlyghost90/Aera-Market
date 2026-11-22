import { api } from '../core/api.js';
import { mountShell } from '../core/shell.js';
import { renderGrid, showSkeletons } from '../core/catalog.js';

await mountShell('/index.html');

const grid = document.getElementById('featured-grid');
const chips = document.getElementById('category-chips');

showSkeletons(grid, 6);

try {
  const [products, categories] = await Promise.all([
    api('/api/products?limit=8'),
    api('/api/categories')
  ]);

  renderGrid(grid, products, 'No products are live yet. The first approved item will appear here.');

  document.getElementById('stat-products').textContent = String(products.length);
  document.getElementById('stat-categories').textContent = String(categories.length);

  for (const category of categories) {
    const chip = document.createElement('a');
    chip.className = 'chip';
    chip.href = `/explore.html?category=${encodeURIComponent(category.id)}`;
    chip.textContent = category.name;
    chips.append(chip);
  }
} catch (error) {
  renderGrid(grid, [], error.message || 'Could not load the catalogue.');
}
