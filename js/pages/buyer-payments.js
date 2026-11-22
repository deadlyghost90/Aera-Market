import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell } from '../core/shell.js';
import { formatMoney, formatDate, labelStatus, toMinor } from '../core/format.js';

await mountShell('/buyer-payments.html');

const summary = document.getElementById('summary');
const statusText = document.getElementById('status');
const table = document.getElementById('payments-table');
const body = document.getElementById('payments-body');

const REFUNDABLE = new Set(['PAID', 'PARTIALLY_REFUNDED']);

const session = await currentSession();
if (!session) {
  redirectToLogin();
} else {
  await load();
}

async function load() {
  try {
    const result = await api('/api/payments');
    const { summary: totals, payments } = result;

    summary.textContent = `${totals.paidCount} completed payment(s), net spend ${formatMoney(
      totals.totalSpentMinor
    )}, refunded ${formatMoney(totals.refundedMinor)}.`;
    statusText.textContent = payments.length === 0 ? 'No payments yet.' : '';

    body.replaceChildren();
    for (const payment of payments) {
      body.append(renderRow(payment));
    }
    table.hidden = payments.length === 0;
  } catch (error) {
    statusText.textContent = error.message || 'Could not load your payments.';
  }
}

function renderRow(payment) {
  const row = document.createElement('tr');

  const date = document.createElement('td');
  date.textContent = formatDate(payment.createdAt);

  const product = document.createElement('td');
  product.textContent = payment.productName;

  const amount = document.createElement('td');
  amount.textContent = formatMoney(payment.amountMinor, payment.currency);

  const status = document.createElement('td');
  status.textContent = labelStatus(payment.status);

  const refunded = document.createElement('td');
  refunded.textContent = payment.refundedAmountMinor
    ? formatMoney(payment.refundedAmountMinor, payment.currency)
    : '—';

  const actions = document.createElement('td');
  if (REFUNDABLE.has(payment.status)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Request refund';
    button.addEventListener('click', () => requestRefund(payment));
    actions.append(button);
  }

  row.append(date, product, amount, status, refunded, actions);
  return row;
}

async function requestRefund(payment) {
  const remaining = payment.amountMinor - payment.refundedAmountMinor;
  const amountInput = window.prompt(
    `Refund amount in PKR (maximum ${(remaining / 100).toFixed(2)})`,
    (remaining / 100).toFixed(2)
  );
  if (amountInput === null) return;

  const amountMinor = toMinor(amountInput);
  if (!amountMinor || amountMinor > remaining) {
    window.alert('Enter a valid amount within the refundable balance.');
    return;
  }

  const reason = window.prompt('Reason for the refund (at least 10 characters)');
  if (!reason || reason.trim().length < 10) {
    window.alert('Please provide a reason of at least 10 characters.');
    return;
  }

  try {
    await api('/api/refunds', {
      method: 'POST',
      body: { paymentId: payment.id, amountMinor, reason: reason.trim() }
    });
    window.alert('Refund request submitted. An administrator will review it.');
    await load();
  } catch (error) {
    window.alert(error.message || 'The refund request could not be submitted.');
  }
}
