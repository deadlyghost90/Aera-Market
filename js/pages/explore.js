import { api } from '../core/api.js';
import { mountShell } from '../core/shell.js';
import { renderGrid, showSkeletons } from '../core/catalog.js';

await mountShell('/explore.html');

const grid = document.getElementById('results');
const chips = document.getElementById('filter-chips');
const count = document.getElementById('result-count');
const searchForm = document.getElementById('filter-form');
const searchInput = document.getElementById('filter-q');
const sortSelect = document.getElementById('filter-sort');

const params = new URLSearchParams(window.location.search);
let categoryId = params.get('category') ?? '';
let search = params.get('q') ?? '';
let sort = params.get('sort') ?? 'created-desc';
searchInput.value = search;
sortSelect.value = sort;

const categories = await api('/api/categories').catch(() => []);

function renderChips() {
  chips.replaceChildren();

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip chip--premium';
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
    chip.className = 'chip chip--premium';
    chip.textContent = category.name;
    chip.setAttribute('aria-pressed', String(categoryId === category.id));
    chip.addEventListener('click', () => {
      categoryId = category.id;
      void load();
    });
    chips.append(chip);
  }
}

function applySort(products) {
  const list = [...products];
  if (sort === 'price-asc') list.sort((a, b) => a.priceMinor - b.priceMinor);
  else if (sort === 'price-desc') list.sort((a, b) => b.priceMinor - a.priceMinor);
  else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => (b.approvedAt?.seconds ?? 0) - (a.approvedAt?.seconds ?? 0));
  return list;
}

async function load() {
  renderChips();
  showSkeletons(grid, 8);

  const query = new URLSearchParams();
  if (categoryId) query.set('category', categoryId);
  if (search) query.set('q', search);
  query.set('limit', '48');

  const url = new URL(window.location.href);
  url.search = query.toString();
  if (sort !== 'created-desc') url.searchParams.set('sort', sort);
  history.replaceState(null, '', url.toString());

  try {
    const products = await api(`/api/products?${query.toString()}`);
    const ordered = applySort(products || []);
    renderGrid(grid, ordered, 'Nothing matches those filters yet.', {
      premium: true,
      showBadge: true
    });
    count.textContent = `${ordered.length} product(s)`;
  } catch (error) {
    renderGrid(grid, [], error.message || 'Could not load products.');
    count.textContent = '';
  }
}

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  search = searchInput.value.trim();
  void load();
});

sortSelect?.addEventListener('change', () => {
  sort = sortSelect.value;
  void load();
});

await load();
