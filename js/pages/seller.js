import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell, money, label, statusBadge, timeAgo, toast } from '../core/shell.js';

const session = await mountShell('/seller-dashboard.html');

const el = (id) => document.getElementById(id);
let state = { seller: null, categories: [], draft: null };

if (!session) {
  el('gate').hidden = false;
} else {
  await boot();
}

async function boot() {
  const seller = await api('/api/sellers/apply').catch(() => null);
  state.seller = seller;

  if (!seller) {
    el('apply').hidden = false;
    bindApply();
    return;
  }

  if (seller.status !== 'APPROVED') {
    el('status').hidden = false;
    el('status-title').textContent =
      seller.status === 'PENDING'
        ? 'Application under review'
        : seller.status === 'REJECTED'
          ? 'Application not approved'
          : 'Account suspended';

    el('status-text').textContent =
      seller.rejectionReason ||
      (seller.status === 'PENDING'
        ? 'An administrator will review your profile shortly.'
        : 'Contact support if you believe this is a mistake.');
    return;
  }

  el('hub').hidden = false;
  el('new-product').hidden = false;
  el('new-product').addEventListener('click', openWizard);
  await loadHub();
}

function bindApply() {
  const form = el('apply-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await api('/api/sellers/apply', {
        method: 'POST',
        body: {
          displayName: data.get('displayName'),
          bio: data.get('bio'),
          country: data.get('country')
        }
      });
      toast('Application submitted for review');
      window.location.reload();
    } catch (error) {
      toast(error.message || 'Could not submit application', 'err');
    }
  });
}

async function loadHub() {
  const data = await api('/api/sellers/me');
  if (!data) return;

  const stats = el('stats');
  stats.replaceChildren();
  const items = [
    ['Published', data.seller.stats.products],
    ['Sales', data.seller.stats.sales],
    ['Gross', money(data.seller.stats.grossMinor)],
    ['Commission', `${data.seller.commissionPercent}%`]
  ];
  for (const [name, value] of items) {
    const box = document.createElement('dl');
    box.className = 'stat';
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    box.append(dt, dd);
    stats.append(box);
  }

  const rows = el('product-rows');
  rows.replaceChildren();
  el('product-count').textContent = `${data.products.length} product(s)`;
  el('no-products').hidden = data.products.length > 0;

  for (const product of data.products) {
    const row = document.createElement('tr');

    const title = document.createElement('td');
    title.textContent = product.title;

    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = statusBadge(product.status);
    badge.textContent = label(product.status);
    status.append(badge);

    const price = document.createElement('td');
    price.textContent = money(product.priceMinor);

    const files = document.createElement('td');
    files.textContent = String(product.files ?? 0);

    const updated = document.createElement('td');
    updated.textContent = timeAgo(product.updatedAt);

    const action = document.createElement('td');
    if (product.status === 'DRAFT' || product.status === 'CHANGES_REQUESTED') {
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.className = 'btn btn-sm';
      resume.textContent = 'Finish';
      resume.addEventListener('click', () => openWizard({ id: product.id }));
      action.append(resume);
    }

    if (product.rejectionNote) {
      const note = document.createElement('div');
      note.className = 'small text-warn';
      note.textContent = product.rejectionNote;
      title.append(note);
    }

    row.append(title, status, price, files, updated, action);
    rows.append(row);
  }

  state.categories = await api('/api/categories').catch(() => []);
  await renderEarnings();
}

async function renderEarnings() {
  const earnings = await api('/api/sellers/me/earnings').catch(() => null);
  if (!earnings) return;

  el('commission-badge').textContent = `${earnings.commissionPercent}% commission`;

  const stats = el('earnings-stats');
  stats.replaceChildren();
  const items = [
    ['Available', money(earnings.balance.availableMinor)],
    ['Lifetime net', money(earnings.balance.lifetimeMinor)],
    ['Gross sales', money(earnings.totals.salesMinor)],
    ['Commission paid', money(earnings.totals.commissionMinor)]
  ];
  for (const [name, value] of items) {
    const box = document.createElement('dl');
    box.className = 'stat';
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    box.append(dt, dd);
    stats.append(box);
  }

  const rows = el('earnings-rows');
  rows.replaceChildren();
  el('earnings-empty').hidden = earnings.entries.length > 0;

  for (const entry of earnings.entries) {
    const row = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = timeAgo(entry.createdAt);

    const type = document.createElement('td');
    type.textContent = label(entry.type);

    const amount = document.createElement('td');
    amount.textContent = money(entry.amountMinor, entry.currency);
    amount.className = entry.amountMinor < 0 ? 'text-warn' : 'text-ok';

    const order = document.createElement('td');
    order.className = 'mono small';
    order.textContent = entry.orderId;

    row.append(date, type, amount, order);
    rows.append(row);
  }
}

async function openWizard(existing) {
  el('wizard').hidden = false;
  const form = el('product-form');
  const categorySelect = el('category-select');
  const kindSelect = el('kind-select');

  if (state.categories.length === 0) {
    state.categories = await api('/api/categories').catch(() => []);
  }

  categorySelect.replaceChildren();
  for (const category of state.categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  }

  const kinds = [
    'SOURCE_CODE', 'WEBSITE_TEMPLATE', 'SCRIPT_AUTOMATION', 'PLUGIN_EXTENSION',
    'API_TOOL', 'SOFTWARE_APP', 'MINECRAFT_RESOURCE', 'GAME_ASSET', 'UI_KIT', 'GRAPHICS', 'OTHER'
  ];
  kindSelect.replaceChildren();
  for (const kind of kinds) {
    const option = document.createElement('option');
    option.value = kind;
    option.textContent = label(kind);
    kindSelect.append(option);
  }

  state.draft = existing ? { id: existing.id } : null;
  el('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (existing?.id) {
    const full = await api(`/api/products/${encodeURIComponent(existing.id)}`).catch(() => null);
    if (full) {
      const set = (name, value) => {
        const field = form.elements.namedItem(name);
        if (field) field.value = value ?? '';
      };
      set('title', full.title);
      set('summary', full.summary);
      set('description', full.description);
      set('categoryId', full.categoryId);
      set('kind', full.kind);
      set('license', full.license);
      set('price', (full.priceMinor / 100).toFixed(2));
      set('tags', (full.tags ?? []).join(', '));
      el('upload-step').hidden = false;
      el('wizard-step').textContent = 'Step 2 of 3';
      bindUploads();
    }
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const price = Math.round(Number(data.get('price')) * 100);

    const payload = {
      title: data.get('title'),
      summary: data.get('summary'),
      description: data.get('description'),
      categoryId: data.get('categoryId'),
      kind: data.get('kind'),
      license: data.get('license'),
      priceMinor: price,
      tags: String(data.get('tags') || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    const editing = Boolean(state.draft?.id);

    try {
      const product = await api(
        editing ? `/api/products/${encodeURIComponent(state.draft.id)}` : '/api/products',
        { method: editing ? 'PATCH' : 'POST', body: payload }
      );

      state.draft = product;
      toast(editing ? 'Draft updated' : 'Draft saved — now attach the files');
      el('upload-step').hidden = false;
      el('wizard-step').textContent = 'Step 2 of 3';
      bindUploads();
    } catch (error) {
      toast(error.message || 'Could not save draft', 'err');
    }
  };
}

function bindUploads() {
  if (el('upload-step').dataset.bound === '1') return;
  el('upload-step').dataset.bound = '1';

  el('file-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !state.draft) return;
    await upload(file, 'file');
  });

  el('preview-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !state.draft) return;
    await upload(file, 'preview');
  });

  el('submit-review').addEventListener('click', submitForReview);
}

async function upload(file, purpose) {
  const status = el('upload-status');
  status.textContent = `Uploading ${file.name}…`;

  try {
    const presign = await api('/api/uploads/presign', {
      method: 'POST',
      body: {
        productId: state.draft.id,
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/octet-stream',
        purpose
      }
    });

    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });

    if (!put.ok) throw new Error(`Upload rejected (${put.status})`);

    await api('/api/uploads/complete', {
      method: 'POST',
      body: {
        productId: state.draft.id,
        key: presign.key,
        fileId: presign.fileId,
        name: presign.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/octet-stream',
        purpose
      }
    });

    status.textContent = `${file.name} uploaded.`;
    el('submit-review').disabled = false;
    el('wizard-step').textContent = 'Step 3 of 3';
    toast('File verified in storage');
  } catch (error) {
    status.textContent = error.message || 'Upload failed';
    toast(error.message || 'Upload failed', 'err');
  }
}

async function submitForReview() {
  if (!state.draft) return;
  const button = el('submit-review');
  button.disabled = true;

  const response = await fetch(`/api/products/${encodeURIComponent(state.draft.id)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'aera-market' }
  });

  const payload = await response.json().catch(() => null);
  const checks = payload?.data?.checks ?? [];
  const blocking = payload?.data?.blocking ?? [];

  if (response.ok) {
    if (checks.length > 0) renderChecks(checks, []);
    toast('Submitted for review');
    window.setTimeout(() => window.location.reload(), 900);
    return;
  }

  if (checks.length > 0) renderChecks(checks, blocking);
  toast(payload?.error?.message ?? 'Submission blocked', 'err');
  button.disabled = false;
}

function renderChecks(checks, blocking) {
  el('checks').hidden = false;
  const list = el('check-list');
  list.replaceChildren();

  for (const check of checks) {
    const item = document.createElement('li');
    item.className = 'check-item';
    const dot = document.createElement('span');
    dot.className = `check-dot ${check.passed ? 'ok' : check.blocking ? '' : 'warn'}`;
    const text = document.createElement('span');
    text.textContent = `${check.label} — ${check.detail}`;
    item.append(dot, text);
    list.append(item);
  }

  if (blocking.length > 0) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-bad mt-2';
    alert.textContent = 'Fix the red items, re-upload if needed, then submit again.';
    el('checks').append(alert);
  }
}
