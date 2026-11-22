import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell } from '../core/shell.js';
import { formatMoney } from '../core/format.js';

await mountShell();

const status = document.getElementById('status');
const actions = document.getElementById('actions');
const nameCell = document.getElementById('product-name');
const priceCell = document.getElementById('product-price');
const commissionCell = document.getElementById('commission-label');
const payButton = document.getElementById('pay-button');
const note = document.getElementById('pay-note');

const productId = new URLSearchParams(window.location.search).get('product');

let product = null;

function fail(message) {
  status.textContent = message;
  actions.hidden = true;
}

async function startPayment() {
  const session = await currentSession();
  if (!session) {
    redirectToLogin();
    return;
  }

  payButton.disabled = true;
  note.textContent = 'Creating your order…';

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: { items: [{ productId: product.id }] }
    });

    note.textContent = 'Opening the secure checkout…';

    const payment = await api('/api/payments/initiate', {
      method: 'POST',
      body: { orderId: order.id }
    });

    if (!payment || !payment.checkoutUrl) {
      throw new Error('The gateway did not return a checkout link.');
    }

    window.location.assign(payment.checkoutUrl);
  } catch (error) {
    payButton.disabled = false;
    note.textContent = error.message || 'Payment could not be started.';
  }
}

if (!productId) {
  fail('No product selected.');
} else {
  try {
    product = await api(`/api/products/${encodeURIComponent(productId)}`);
    const config = await api('/api/config/public');

    if (!config.paymentsEnabled) {
      fail('Payments are temporarily unavailable.');
    } else {
      nameCell.textContent = product.title;
      priceCell.textContent = formatMoney(product.priceMinor, product.currency);
      commissionCell.textContent = `${config.commissionPercent}% platform commission (${formatMoney(
        Math.round((product.priceMinor * config.commissionPercent) / 100),
        product.currency
      )})`;

      status.textContent = 'Review your order, then continue to the payment gateway.';
      actions.hidden = false;
    }
  } catch (error) {
    fail(error.message || 'Could not load this product.');
  }
}

payButton.addEventListener('click', startPayment);
