import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell, money, label, toast } from '../core/shell.js';

await mountShell();

const id = new URLSearchParams(window.location.search).get('id');
const buyButton = document.getElementById('buy');
const note = document.getElementById('buy-note');

function fail(message) {
  document.getElementById('title').textContent = 'Product unavailable';
  document.getElementById('description').textContent = message;
  buyButton.disabled = true;
}

if (!id) {
  fail('No product was requested.');
} else {
  try {
    const product = await api(`/api/products/${encodeURIComponent(id)}`);

    document.title = `${product.title} — Aera Market`;
    document.getElementById('title').textContent = product.title;
    document.getElementById('summary').textContent = product.summary;
    document.getElementById('description').textContent = product.description;
    document.getElementById('price').textContent = money(product.priceMinor, product.currency);
    document.getElementById('kind').textContent = label(product.kind);
    document.getElementById('author').textContent = product.sellerName || 'Aera author';
    document.getElementById('licence').textContent = label(product.license);
    document.getElementById('tags').textContent = product.tags.join(', ') || '—';

    const preview = document.getElementById('preview');
    if (product.previewUrl) {
      const img = document.createElement('img');
      img.src = product.previewUrl;
      img.alt = product.title;
      preview.append(img);
    } else {
      preview.textContent = 'No preview image';
    }

    const files = document.getElementById('files');
    files.replaceChildren();
    if (!product.files || product.files.length === 0) {
      files.append(Object.assign(document.createElement('li'), { className: 'muted small', textContent: 'File list hidden.' }));
    } else {
      for (const file of product.files) {
        const item = document.createElement('li');
        item.className = 'check-item';
        const dot = document.createElement('span');
        dot.className = 'check-dot ok';
        const text = document.createElement('span');
        text.textContent = `${file.name} · ${(file.sizeBytes / 1024 / 1024).toFixed(2)} MB`;
        item.append(dot, text);
        files.append(item);
      }
    }

    buyButton.addEventListener('click', async () => {
      const session = await currentSession();
      if (!session) {
        redirectToLogin();
        return;
      }

      buyButton.disabled = true;
      note.textContent = 'Creating your order…';

      try {
        const order = await api('/api/orders', {
          method: 'POST',
          body: { items: [{ productId: product.id }] }
        });
        note.textContent = 'Opening secure checkout…';
        const payment = await api('/api/payments/initiate', {
          method: 'POST',
          body: { orderId: order.id }
        });
        window.location.assign(payment.checkoutUrl);
      } catch (error) {
        buyButton.disabled = false;
        note.textContent = error.message || 'Could not start checkout.';
        toast(error.message || 'Checkout failed', 'err');
      }
    });
  } catch (error) {
    fail(error.message || 'This product could not be loaded.');
  }
}
