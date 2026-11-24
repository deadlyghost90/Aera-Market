import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell, money, label, toast } from '../core/shell.js';
import { productCard } from '../core/catalog.js';

await mountShell();

const id = new URLSearchParams(window.location.search).get('id');
const buyButton = document.getElementById('buy');
const note = document.getElementById('buy-note');

function fail(message) {
  document.getElementById('title').textContent = 'Product unavailable';
  document.getElementById('description').textContent = message;
  buyButton.disabled = true;
}

// tabs
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tab')) {
      other.setAttribute('aria-selected', String(other === tab));
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.dataset.active = String(panel.dataset.panel === tab.dataset.tab);
    }
  });
}

if (!id) {
  fail('No product was requested.');
} else {
  try {
    const [product, categories] = await Promise.all([
      api(`/api/products/${encodeURIComponent(id)}`),
      api('/api/categories').catch(() => [])
    ]);

    document.title = `${product.title} — Aera Market`;
    document.getElementById('title').textContent = product.title;
    document.getElementById('summary').textContent = product.summary;
    document.getElementById('description').textContent = product.description;
    document.getElementById('price').textContent = money(product.priceMinor, product.currency);
    document.getElementById('kind').textContent = label(product.kind);
    document.getElementById('kind-meta').textContent = label(product.kind);
    document.getElementById('licence').textContent = label(product.license);
    document.getElementById('tags').textContent = (product.tags || []).join(', ') || '—';
    document.getElementById('licence-text').textContent =
      product.license === 'EXTENDED'
        ? 'Extended licence: use in a product you sell, with the files kept private. Redistribution of the source is not allowed.'
        : 'Standard licence: use the files in your own or a client project. Redistribution of the source is not allowed.';

    const category = categories.find((entry) => entry.id === product.categoryId);
    if (category) {
      const crumb = document.getElementById('breadcrumb');
      const link = document.createElement('a');
      link.href = `/explore.html?category=${encodeURIComponent(category.id)}`;
      link.textContent = `← ${category.name}`;
      crumb.replaceChildren(link);
    }

    const preview = document.getElementById('preview');
    if (product.previewUrl) {
      const img = document.createElement('img');
      img.src = product.previewUrl;
      img.alt = product.title;
      preview.replaceChildren(img);
    } else {
      preview.textContent = 'No preview image';
    }

    const files = document.getElementById('files');
    files.replaceChildren();
    for (const file of product.files || []) {
      const item = document.createElement('li');
      item.className = 'check-item';
      const dot = document.createElement('span');
      dot.className = 'check-dot ok check-dot--premium';
      const text = document.createElement('span');
      text.textContent = `${file.name} · ${(file.sizeBytes / 1024 / 1024).toFixed(2)} MB`;
      item.append(dot, text);
      files.append(item);
    }
    document.getElementById('files-note').textContent =
      (product.files || []).length > 0 ? 'Downloads unlock after payment.' : 'File list available after purchase.';

    const author = product.sellerName || 'Aera author';
    document.getElementById('author').textContent = author;
    document.getElementById('seller-initial').textContent = author.slice(0, 1).toUpperCase();
    document.getElementById('seller-meta').textContent = `${product.salesCount || 0} sale(s) · reviewed author`;

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

    // related
    const related = await api(`/api/products?category=${encodeURIComponent(product.categoryId)}&limit=8`).catch(() => []);
    const list = document.getElementById('related');
    const others = (related || []).filter((entry) => entry.id !== product.id).slice(0, 4);
    if (others.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty--premium';
      empty.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Nothing else in this category yet.</div>`;
      list.style.gridColumn = '1 / -1';
      list.append(empty);
    } else {
      for (const entry of others) {
        list.append(productCard(entry, { premium: true }));
      }
    }
  } catch (error) {
    fail(error.message || 'This product could not be loaded.');
  }
}
