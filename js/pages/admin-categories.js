import { api } from '../core/api.js';
import { mountShell, money, toast } from '../core/shell.js';

const session = await mountShell('/admin-categories.html');
const rows = document.getElementById('rows');
const table = document.getElementById('table');
const statusText = document.getElementById('status');
const createCard = document.getElementById('create-card');
const kindsSelect = document.getElementById('kinds');

const KINDS = [
  'SOURCE_CODE', 'WEBSITE_TEMPLATE', 'SCRIPT_AUTOMATION', 'PLUGIN_EXTENSION',
  'API_TOOL', 'SOFTWARE_APP', 'MINECRAFT_RESOURCE', 'GAME_ASSET', 'UI_KIT', 'GRAPHICS', 'OTHER'
];

if (!session) {
  window.location.assign('/login.html?next=/admin-categories.html');
} else if (session.role !== 'ADMIN') {
  document.getElementById('forbidden').hidden = false;
} else {
  for (const kind of KINDS) {
    const option = document.createElement('option');
    option.value = kind;
    option.textContent = kind.replace(/_/g, ' ').toLowerCase();
    kindsSelect.append(option);
  }
  createCard.hidden = false;
  bindCreate();
  await load();
}

async function load() {
  statusText.textContent = 'Loading…';
  const categories = await api('/api/admin/categories').catch(() => null);

  if (!categories) {
    statusText.textContent = 'Could not load categories.';
    return;
  }

  statusText.textContent = `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`;
  table.hidden = categories.length === 0;
  rows.replaceChildren();

  for (const category of categories) {
    rows.append(row(category));
  }
}

function row(category) {
  const tr = document.createElement('tr');

  const name = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = category.name;
  const slug = document.createElement('div');
  slug.className = 'mono muted small';
  slug.textContent = category.slug;
  name.append(strong, slug);

  const kinds = document.createElement('td');
  kinds.className = 'small muted';
  kinds.textContent = category.allowedKinds.map((kind) => kind.replace(/_/g, ' ').toLowerCase()).join(', ');

  const files = document.createElement('td');
  files.className = 'small muted';
  files.textContent = category.allowedExtensions.join(', ');

  const size = document.createElement('td');
  size.textContent = `${category.maxFileMb} MB`;

  const price = document.createElement('td');
  price.textContent = money(category.minPriceMinor);

  const sort = document.createElement('td');
  sort.textContent = String(category.sort);

  const state = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = category.active ? 'badge badge-ok' : 'badge badge-bad';
  badge.textContent = category.active ? 'Active' : 'Hidden';
  state.append(badge);

  const action = document.createElement('td');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-sm';
  toggle.textContent = category.active ? 'Hide' : 'Publish';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await api('/api/admin/categories', {
        method: 'PATCH',
        body: { id: category.id, active: !category.active }
      });
      toast(category.active ? 'Category hidden' : 'Category published');
      await load();
    } catch (error) {
      toggle.disabled = false;
      toast(error.message || 'Could not update the category', 'err');
    }
  });
  action.append(toggle);

  tr.append(name, kinds, files, size, price, sort, state, action);
  return tr;
}

function bindCreate() {
  const form = document.getElementById('create-form');

  form.elements.namedItem('name').addEventListener('input', (event) => {
    const slugField = form.elements.namedItem('slug');
    if (slugField.dataset.touched === '1') return;
    slugField.value = event.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  });

  form.elements.namedItem('slug').addEventListener('input', (event) => {
    event.target.dataset.touched = '1';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const kinds = Array.from(kindsSelect.selectedOptions).map((option) => option.value);

    if (kinds.length === 0) {
      toast('Select at least one product type', 'err');
      return;
    }

    try {
      await api('/api/admin/categories', {
        method: 'POST',
        body: {
          name: data.get('name'),
          slug: data.get('slug'),
          description: data.get('description'),
          allowedKinds: kinds,
          allowedExtensions: String(data.get('extensions'))
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
          maxFileMb: Number(data.get('maxFileMb')),
          minPriceMinor: Math.round(Number(data.get('minPrice')) * 100),
          sort: Number(data.get('sort')),
          active: true
        }
      });
      toast('Category created');
      form.reset();
      kindsSelect.selectedIndex = -1;
      form.elements.namedItem('slug').dataset.touched = '0';
      await load();
    } catch (error) {
      toast(error.message || 'Could not create the category', 'err');
    }
  });
}
