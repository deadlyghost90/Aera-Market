import { api, currentSession, redirectToLogin } from '../core/api.js';
import { mountShell, money, timeAgo, toast } from '../core/shell.js';

const session = await mountShell('/buyer-library.html');
const grid = document.getElementById('library');
const empty = document.getElementById('empty');
const status = document.getElementById('status');

if (!session) {
  redirectToLogin();
} else {
  await load();
}

async function load() {
  try {
    const purchases = await api('/api/purchases');
    status.textContent = purchases.length
      ? `${purchases.length} product(s) in your library`
      : '';
    empty.hidden = purchases.length > 0;

    grid.replaceChildren();
    for (const purchase of purchases) {
      grid.append(card(purchase));
    }
  } catch (error) {
    status.textContent = error.message || 'Could not load your library.';
  }
}

function card(purchase) {
  const item = document.createElement('li');
  item.className = 'product-card';

  const thumb = document.createElement('div');
  thumb.className = 'product-thumb';
  const img = document.createElement('img');
  img.src = purchase.previewUrl;
  img.alt = purchase.productName;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.remove();
    thumb.textContent = 'Purchased';
  });
  thumb.append(img);

  const body = document.createElement('div');
  body.className = 'product-body';

  const title = document.createElement('a');
  title.className = 'product-title';
  title.href = `/product.html?id=${encodeURIComponent(purchase.productId)}`;
  title.textContent = purchase.productName;

  const meta = document.createElement('div');
  meta.className = 'product-meta';
  meta.textContent = `Purchased ${timeAgo(purchase.grantedAt)} · ${money(
    purchase.priceMinor,
    purchase.currency
  )}`;

  const actions = document.createElement('div');
  actions.className = 'row mt-1';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn btn-primary btn-sm';
  download.textContent = 'Download';
  download.addEventListener('click', async () => {
    download.disabled = true;
    download.textContent = 'Preparing…';
    try {
      const result = await api('/api/downloads/authorize', {
        method: 'POST',
        body: { productId: purchase.productId }
      });
      window.location.assign(result.url);
      download.textContent = 'Download';
      download.disabled = false;
    } catch (error) {
      toast(error.message || 'Download could not be authorised', 'err');
      download.textContent = 'Download';
      download.disabled = false;
    }
  });

  actions.append(download);
  body.append(title, meta, actions);
  item.append(thumb, body);
  return item;
}
