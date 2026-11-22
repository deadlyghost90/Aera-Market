import { api, currentSession, redirectToLogin } from '../core/api.js';
import { formatMoney, formatDate, labelStatus } from '../core/format.js';

const statusText = document.getElementById('status');
const statsBox = document.getElementById('stats');
const filters = document.getElementById('filters');
const table = document.getElementById('payments-table');
const body = document.getElementById('payments-body');
const refundsTable = document.getElementById('refunds-table');
const refundsBody = document.getElementById('refunds-body');

const session = await currentSession();
if (!session) {
  redirectToLogin();
} else if (session.role !== 'ADMIN') {
  statusText.textContent = 'Administrator access is required.';
} else {
  filters.hidden = false;
  await load();
}

function currentQuery() {
  const params = new URLSearchParams();
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value.trim();
  if (status && status !== 'ALL') params.set('status', status);
  if (search) params.set('q', search);
  return params.toString();
}

async function load() {
  statusText.textContent = 'Loading…';
  try {
    const query = currentQuery();
    const result = await api(`/api/admin/payments${query ? `?${query}` : ''}`);

    renderStats(result.stats);
    renderPayments(result.payments);
    renderRefunds(result.refunds);

    statusText.textContent = result.stats.scanComplete
      ? `Showing ${result.payments.length} payment(s).`
      : `Showing ${result.payments.length} payment(s) from the most recent ${result.stats.scanLimit}.`;
  } catch (error) {
    statusText.textContent = error.message || 'Could not load payments.';
  }
}

function renderStats(stats) {
  statsBox.replaceChildren();
  statsBox.hidden = false;

  const items = [
    ['Total volume', formatMoney(stats.totalVolumeMinor)],
    ['Successful', String(stats.successfulCount)],
    ['Failed', String(stats.failedCount)],
    ['Pending', String(stats.pendingCount)],
    ['Refunded', formatMoney(stats.refundedAmountMinor)],
    ['Platform commission', formatMoney(stats.platformCommissionMinor)],
    ['Seller payable', formatMoney(stats.sellerPayableMinor)],
    ['Open refunds', String(stats.openRefundRequests)]
  ];

  for (const [label, value] of items) {
    const wrapper = document.createElement('dl');
    wrapper.className = 'stat';
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    wrapper.append(term, detail);
    statsBox.append(wrapper);
  }
}

function renderPayments(payments) {
  body.replaceChildren();
  table.hidden = payments.length === 0;

  for (const payment of payments) {
    const row = document.createElement('tr');
    const cells = [
      formatDate(payment.createdAt),
      payment.gatewayTrackerId || payment.id,
      payment.userId,
      payment.productName,
      formatMoney(payment.amountMinor, payment.currency),
      formatMoney(payment.commissionMinor, payment.currency),
      labelStatus(payment.status)
    ];

    for (const value of cells) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }

    body.append(row);
  }
}

function renderRefunds(refunds) {
  const open = refunds.filter((refund) =>
    ['REQUESTED', 'APPROVED'].includes(refund.status)
  );

  refundsBody.replaceChildren();
  refundsTable.hidden = open.length === 0;

  for (const refund of open) {
    const row = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = formatDate(refund.createdAt);

    const payment = document.createElement('td');
    payment.textContent = refund.paymentId;

    const amount = document.createElement('td');
    amount.textContent = formatMoney(refund.amountMinor, refund.currency);

    const reason = document.createElement('td');
    reason.textContent = refund.reason;

    const state = document.createElement('td');
    state.textContent = labelStatus(refund.status);

    const actions = document.createElement('td');
    actions.append(...buildActions(refund));

    row.append(date, payment, amount, reason, state, actions);
    refundsBody.append(row);
  }
}

function buildActions(refund) {
  const buttons = [];

  if (refund.status === 'REQUESTED') {
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    approve.addEventListener('click', () => act(refund.id, 'approve'));
    buttons.push(approve);

    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.addEventListener('click', () => act(refund.id, 'reject'));
    buttons.push(reject);
  }

  if (refund.status === 'APPROVED') {
    const complete = document.createElement('button');
    complete.type = 'button';
    complete.textContent = 'Mark completed';
    complete.addEventListener('click', () => act(refund.id, 'complete'));
    buttons.push(complete);
  }

  return buttons;
}

async function act(refundId, action) {
  const note = window.prompt('Note for the audit log (optional)') || undefined;

  let gatewayRefundId;
  if (action === 'complete') {
    gatewayRefundId =
      window.prompt('Gateway refund reference from the Safepay dashboard (required)') || '';
    if (!gatewayRefundId) {
      window.alert('A gateway refund reference is required to mark a refund completed.');
      return;
    }
  }

  try {
    await api(`/api/admin/refunds/${encodeURIComponent(refundId)}`, {
      method: 'PATCH',
      body: { action, note, gatewayRefundId }
    });
    await load();
  } catch (error) {
    window.alert(error.message || 'The action failed.');
  }
}

filters.addEventListener('submit', (event) => {
  event.preventDefault();
  void load();
});
