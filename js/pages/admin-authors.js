import { api } from '../core/api.js';
import { mountShell, label, timeAgo, statusBadge, toast } from '../core/shell.js';

const session = await mountShell('/admin-authors.html');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const tabs = document.getElementById('tabs');

let status = 'PENDING';

if (!session) {
  window.location.assign('/login.html?next=/admin-authors.html');
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
  empty.hidden = true;
  list.replaceChildren();

  const authors = await api(`/api/admin/sellers?status=${encodeURIComponent(status)}`).catch(() => []);
  count.textContent = `${authors.length} author(s)`;
  empty.hidden = authors.length > 0;

  for (const author of authors) {
    list.append(renderCard(author));
  }
}

function renderCard(author) {
  const card = document.createElement('article');
  card.className = 'card';

  const head = document.createElement('div');
  head.className = 'spread';

  const left = document.createElement('div');
  const name = document.createElement('h3');
  name.textContent = author.displayName;
  const meta = document.createElement('p');
  meta.className = 'muted small mt-1';
  meta.textContent = `${author.country} · applied ${timeAgo(author.createdAt)} · ${author.commissionPercent}% commission`;
  left.append(name, meta);

  const badge = document.createElement('span');
  badge.className = statusBadge(author.status);
  badge.textContent = label(author.status);
  head.append(left, badge);

  const bio = document.createElement('p');
  bio.className = 'muted small mt-2';
  bio.textContent = author.bio;

  const note = document.createElement('textarea');
  note.placeholder = 'Reason (required when rejecting or suspending)';
  note.maxLength = 500;

  const actions = document.createElement('div');
  actions.className = 'row mt-2';

  if (author.status !== 'APPROVED') {
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn-primary btn-sm';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => act(author.uid, 'APPROVED', note.value, card));
    actions.append(approve);
  }

  if (author.status !== 'REJECTED') {
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'btn btn-danger btn-sm';
    reject.textContent = author.status === 'APPROVED' ? 'Suspend' : 'Reject';
    reject.addEventListener('click', () =>
      act(author.uid, author.status === 'APPROVED' ? 'SUSPENDED' : 'REJECTED', note.value, card)
    );
    actions.append(reject);
  }

  if (author.status === 'APPROVED') {
    const adjust = document.createElement('button');
    adjust.type = 'button';
    adjust.className = 'btn btn-sm';
    adjust.textContent = 'Set commission';
    adjust.addEventListener('click', () => setCommission(author.uid, author.commissionPercent));
    actions.append(adjust);
  }

  card.append(head, bio, note, actions);
  return card;
}

async function act(uid, nextStatus, note, card) {
  const reason = (note || '').trim();
  if (nextStatus !== 'APPROVED' && reason.length < 10) {
    toast('Write a short reason (10+ characters) first', 'err');
    return;
  }

  try {
    await api('/api/admin/sellers', {
      method: 'PATCH',
      body: {
        uid,
        status: nextStatus,
        reason: nextStatus === 'APPROVED' ? undefined : reason
      }
    });
    card.remove();
    const remaining = list.children.length;
    count.textContent = `${remaining} author(s)`;
    empty.hidden = remaining > 0;
    toast(`Author ${label(nextStatus).toLowerCase()}`);
  } catch (error) {
    toast(error.message || 'Could not update the author', 'err');
  }
}

async function setCommission(uid, current) {
  const input = window.prompt('Commission percent for this author', String(current));
  if (input === null) return;
  const value = Number(input);
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    toast('Enter a whole number between 0 and 100', 'err');
    return;
  }

  try {
    await api('/api/admin/sellers', {
      method: 'PATCH',
      body: { uid, status: 'APPROVED', commissionPercent: value }
    });
    toast(`Commission set to ${value}%`);
    await load();
  } catch (error) {
    toast(error.message || 'Could not update commission', 'err');
  }
}
