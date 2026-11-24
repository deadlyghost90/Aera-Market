import { money, label } from './shell.js';

/** Shared product card used by the home page and the explore grid. */
export function productCard(product, options = {}) {
  const item = document.createElement('li');
  const isPremium = options.premium !== false;
  item.className = `product-card${isPremium ? ' product-card--premium' : ''}`;
  if (options.revealDelay != null) item.classList.add('reveal', `reveal-delay-${options.revealDelay}`);

  const thumb = document.createElement('div');
  thumb.className = 'product-thumb product-thumb--premium';
  if (product.previewUrl) {
    const img = document.createElement('img');
    img.src = product.previewUrl;
    img.alt = product.title;
    img.loading = 'lazy';
    thumb.append(img);
  } else {
    thumb.textContent = label(product.kind);
  }

  const body = document.createElement('div');
  body.className = 'product-body product-body--premium';

  const title = document.createElement('a');
  title.className = 'product-title';
  title.href = `/product.html?id=${encodeURIComponent(product.id)}`;
  title.textContent = product.title;

  const meta = document.createElement('div');
  meta.className = 'product-meta';
  meta.append(
    document.createTextNode(product.sellerName || 'Aera author'),
    document.createTextNode(' · '),
    document.createTextNode(label(product.kind))
  );

  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = money(product.priceMinor, product.currency);

  // Optional "new" badge for recently added products
  if (options.showBadge && product.createdAt) {
    const daysSince = Math.floor((Date.now() - new Date(product.createdAt.seconds * 1000).getTime()) / 86400000);
    if (daysSince <= 7) {
      const badge = document.createElement('span');
      badge.className = 'product-badge-new';
      badge.textContent = 'New';
      thumb.style.position = 'relative';
      thumb.style.display = 'block';
      thumb.prepend(badge);
    }
  }

  body.append(title, meta, price);
  item.append(thumb, body);
  return item;
}

export function renderGrid(host, products, emptyMessage, options = {}) {
  host.replaceChildren();
  if (!products || products.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty--premium';
    empty.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg><div>${emptyMessage || 'No products found.'}</div>`;
    host.append(empty);
    return;
  }
  for (const product of products) host.append(productCard(product, options));
}

export function showSkeletons(host, count = 6) {
  host.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('li');
    item.className = 'skeleton skeleton--premium';
    host.append(item);
  }
}
