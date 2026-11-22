import { money, label } from './shell.js';

/** Shared product card used by the home page and the explore grid. */
export function productCard(product) {
  const item = document.createElement('li');
  item.className = 'product-card';

  const thumb = document.createElement('div');
  thumb.className = 'product-thumb';
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
  body.className = 'product-body';

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

  body.append(title, meta, price);
  item.append(thumb, body);
  return item;
}

export function renderGrid(host, products, emptyMessage) {
  host.replaceChildren();
  if (!products || products.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = emptyMessage;
    host.append(empty);
    return;
  }
  for (const product of products) host.append(productCard(product));
}

export function showSkeletons(host, count = 6) {
  host.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('li');
    item.className = 'skeleton';
    host.append(item);
  }
}
