import { api } from '../core/api.js';
import { mountShell } from '../core/shell.js';
import { renderGrid, showSkeletons } from '../core/catalog.js';

await mountShell('/explore.html');

const grid = document.getElementById('results');
const chips = document.getElementById('filter-chips');
const count = document.getElementById('result-count');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

const params = new URLSearchParams(window.location.search);
let categoryId = params.get('category') ?? '';
let search = params.get('q') ?? '';
searchInput.value = search;

const categories = await api('/api/categories').catch(() => []);

function renderChips() {
  chips.replaceChildren();

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip';
  all.textContent = 'All categories';
  all.setAttribute('aria-pressed', String(categoryId === ''));
  all.addEventListener('click', () => {
    categoryId = '';
    void load();
  });
  chips.append(all);

  for (const category of categories) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = category.name;
    chip.setAttribute('aria-pressed', String(categoryId === category.id));
    chip.addEventListener('click', () => {
      categoryId = category.id;
      void load();
    });
    chips.append(chip);
  }
}

async function load() {
  renderChips();
  showSkeletons(grid, 6);

  const query = new URLSearchParams();
  if (categoryId) query.set('category', categoryId);
  if (search) query.set('q', search);
  query.set('limit', '48');

  history.replaceState(null, '', `${window.location.pathname}?${query.toString()}`);

  try {
    const products = await api(`/api/products?${query.toString()}`);
    renderGrid(grid, products, 'Nothing matches those filters yet.');
    count.textContent = `${products.length} product(s)`;
  } catch (error) {
    renderGrid(grid, [], error.message || 'Could not load products.');
    count.textContent = '';
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  search = searchInput.value.trim();
  void load();
});

await load();
