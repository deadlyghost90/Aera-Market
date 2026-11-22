import { api } from '../core/api.js';
import { mountShell, money, label, toast } from '../core/shell.js';

const session = await mountShell('/admin-review.html');
const queue = document.getElementById('queue');
const empty = document.getElementById('empty');
const count = document.getElementById('queue-count');
const tabs = document.getElementById('status-tabs');

let status = 'PENDING_REVIEW';

if (!session) {
  window.location.assign('/login.html?next=/admin-review.html');
} else if (session.role !== 'ADMIN') {
  document.getElementById('forbidden').hidden = false;
} else {
  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    status = button.dataset.status;
    for (const chip of tabs.querySelectorAll('[data-status]')) {
      chip.setAttribute('aria-pressed', String(chip === button));
    }
    void load();
  });
  await load();
}

async function load() {
  const products = await api(`/api/admin/products?status=${encodeURIComponent(status)}`).catch(() => []);
  queue.replaceChildren();
  count.textContent = `${products.length} ${status === 'PENDING_REVIEW' ? 'waiting' : 'product(s)'}`;
  empty.hidden = products.length > 0;

  for (const product of products) {
    queue.append(renderCard(product));
  }
}

function renderCard(product) {
  const card = document.createElement('article');
  card.className = 'card card-elevated';

  const head = document.createElement('div');
  head.className = 'spread';

  const left = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = product.title;
  const meta = document.createElement('p');
  meta.className = 'muted small mt-1';
  meta.textContent = `${product.sellerName} · ${label(product.kind)} · ${money(product.priceMinor)} · ${product.files.length} file(s)`;
  left.append(title, meta);

  const badge = document.createElement('span');
  badge.className =
    status === 'APPROVED' ? 'badge badge-ok' : status === 'SUSPENDED' ? 'badge badge-bad' : 'badge badge-warn';
  badge.textContent = label(status);
  head.append(left, badge);

  const summary = document.createElement('p');
  summary.className = 'muted small mt-2';
  summary.textContent = product.summary;

  if (product.previewUrl) {
    const visual = document.createElement('div');
    visual.className = 'product-thumb';
    visual.style.maxWidth = '320px';
    visual.style.borderRadius = '12px';
    visual.style.marginTop = '0.75rem';
    visual.style.border = '1px solid var(--line)';

    const img = document.createElement('img');
    img.src = `/api/previews/${encodeURIComponent(product.id)}`;
    img.alt = product.title;
    img.addEventListener('error', () => visual.remove());
    visual.append(img);
    card.append(head, visual, summary);
  } else {
    card.append(head, summary);
  }

  const checks = document.createElement('ul');
  checks.className = 'check-list mt-2';
  for (const check of product.review?.checks ?? []) {
    const item = document.createElement('li');
    item.className = 'check-item';
    const dot = document.createElement('span');
    dot.className = `check-dot ${check.passed ? 'ok' : check.blocking ? '' : 'warn'}`;
    const text = document.createElement('span');
    text.textContent = `${check.label} — ${check.detail}`;
    item.append(dot, text);
    checks.append(item);
  }

  const files = document.createElement('p');
  files.className = 'mono muted small mt-2';
  files.textContent = product.files
    .map((file) => `${file.name} (${(file.sizeBytes / 1024 / 1024).toFixed(2)} MB)`)
    .join('  ·  ');

  const note = document.createElement('textarea');
  note.placeholder = 'Reviewer note (required when rejecting or requesting changes)';
  note.maxLength = 1000;

  const reason = document.createElement('select');
  const reasons = [
    ['', 'Select a reason (optional for approval)'],
    ['FILES_DO_NOT_MATCH_DESCRIPTION', 'Files do not match the description'],
    ['QUALITY_BELOW_STANDARD', 'Quality below standard'],
    ['INCOMPLETE_PACKAGE', 'Incomplete package'],
    ['MISSING_DOCUMENTATION', 'Missing documentation'],
    ['LICENSE_OR_COPYRIGHT_ISSUE', 'Licence or copyright issue'],
    ['PROHIBITED_CONTENT', 'Prohibited content'],
    ['DUPLICATE_SUBMISSION', 'Duplicate submission'],
    ['MISLEADING_PREVIEW', 'Misleading preview'],
    ['TECHNICAL_ERRORS', 'Technical errors'],
    ['OTHER', 'Other']
  ];
  for (const [value, text] of reasons) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    reason.append(option);
  }

  const actions = document.createElement('div');
  actions.className = 'row mt-2';

  const makeButton = (text, decision, className) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = text;
    element.addEventListener('click', () =>
      decide(product.id, decision, note.value, reason.value, card)
    );
    return element;
  };

  if (status === 'PENDING_REVIEW') {
    actions.append(
      makeButton('Approve', 'APPROVE', 'btn btn-primary btn-sm'),
      makeButton('Request changes', 'REQUEST_CHANGES', 'btn btn-sm'),
      makeButton('Reject', 'REJECT', 'btn btn-danger btn-sm')
    );
  } else if (status === 'APPROVED') {
    actions.append(makeButton('Suspend', 'SUSPEND', 'btn btn-danger btn-sm'));
  } else {
    actions.append(makeButton('Restore listing', 'APPROVE', 'btn btn-primary btn-sm'));
  }

  card.append(checks, files, note, reason, actions);
  return card;
}

async function decide(productId, decision, note, reason, card) {
  if (decision !== 'APPROVE' && (!note || note.trim().length < 20)) {
    toast('Write at least 20 characters explaining the decision', 'err');
    return;
  }

  try {
    await api('/api/admin/products', {
      method: 'POST',
      body: {
        productId,
        decision,
        note: note?.trim() || undefined,
        reason: reason || undefined
      }
    });
    card.remove();
    const remaining = queue.children.length;
    count.textContent = `${remaining} waiting`;
    empty.hidden = remaining > 0;
    toast(decision === 'APPROVE' ? 'Product approved and listed' : 'Decision saved');
  } catch (error) {
    toast(error.message || 'Could not save the decision', 'err');
  }
}
