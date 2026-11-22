import { api } from '../core/api.js';
import { mountShell, money, label, timeAgo, toast } from '../core/shell.js';

const session = await mountShell('/seller-earnings.html');
const status = document.getElementById('status');
const stats = document.getElementById('stats');
const card = document.getElementById('entries-card');
const badge = document.getElementById('commission-badge');
const rows = document.getElementById('rows');
const empty = document.getElementById('empty');

if (!session) {
  window.location.assign('/login.html?next=/seller-earnings.html');
} else {
  await load();
}

async function load() {
  let data;
  try {
    data = await api('/api/sellers/me/earnings');
  } catch (error) {
    status.textContent = error.message || 'Could not load earnings.';
    toast(error.message || 'Could not load earnings', 'err');
    return;
  }

  status.textContent =
    data.status === 'APPROVED'
      ? `Commission ${data.commissionPercent}% per sale`
      : `Author status: ${label(data.status)}`;

  stats.hidden = false;
  stats.replaceChildren();

  const figures = [
    ['Available', money(data.balance.availableMinor)],
    ['Lifetime net', money(data.balance.lifetimeMinor)],
    ['Gross sales', money(data.totals.salesMinor)],
    ['Commission paid', money(data.totals.commissionMinor)],
    ['Refunded', money(data.totals.refundsMinor)]
  ];

  for (const [name, value] of figures) {
    const box = document.createElement('dl');
    box.className = 'stat';
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    box.append(dt, dd);
    stats.append(box);
  }

  card.hidden = false;
  badge.textContent = `${data.commissionPercent}% commission`;
  empty.hidden = data.entries.length > 0;
  rows.replaceChildren();

  for (const entry of data.entries) {
    const row = document.createElement('tr');

    const date = document.createElement('td');
    date.className = 'muted';
    date.textContent = timeAgo(entry.createdAt);

    const type = document.createElement('td');
    type.textContent = label(entry.type);

    const amount = document.createElement('td');
    amount.className = entry.amountMinor < 0 ? 'text-warn' : 'text-ok';
    amount.textContent = money(entry.amountMinor, entry.currency);

    const order = document.createElement('td');
    order.className = 'mono muted';
    order.textContent = entry.orderId;

    row.append(date, type, amount, order);
    rows.append(row);
  }
}
