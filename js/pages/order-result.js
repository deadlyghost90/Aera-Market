import { api } from '../core/api.js';
import { formatMoney, formatDate, labelStatus } from '../core/format.js';

const statusText = document.getElementById('status');
const details = document.getElementById('details');
const paymentIdCell = document.getElementById('payment-id');
const orderIdCell = document.getElementById('order-id');
const amountCell = document.getElementById('amount');
const statusCell = document.getElementById('payment-status');

const params = new URLSearchParams(window.location.search);
const paymentId = params.get('payment');
const state = params.get('state');

const TERMINAL = new Set(['PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']);

function render(payment) {
  details.hidden = false;
  paymentIdCell.textContent = payment.id;
  orderIdCell.textContent = payment.orderId;
  amountCell.textContent = formatMoney(payment.amountMinor, payment.currency);
  statusCell.textContent = labelStatus(payment.status);
  statusText.textContent = `Last checked ${formatDate(Date.now())}`;
}

if (!paymentId) {
  statusText.textContent =
    state === 'invalid_signature'
      ? 'The gateway response could not be verified. If you were charged, contact support.'
      : 'No payment reference was provided.';
} else {
  let attempts = 0;

  const poll = async () => {
    attempts += 1;
    try {
      const result = await api(`/api/payments/${encodeURIComponent(paymentId)}/status`);
      render(result.payment);

      if (TERMINAL.has(result.payment.status)) {
        statusText.textContent = `Payment ${labelStatus(result.payment.status).toLowerCase()}.`;
        return;
      }
    } catch (error) {
      statusText.textContent = error.message || 'Could not check the payment status.';
    }

    if (attempts < 20) {
      window.setTimeout(poll, 3000);
    } else {
      statusText.textContent =
        'Still waiting for the gateway to confirm this payment. Refresh in a minute.';
    }
  };

  await poll();
}
