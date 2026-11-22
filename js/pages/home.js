import { api } from '../core/api.js';
import { formatMoney } from '../core/format.js';

const list = document.getElementById('product-list');
const status = document.getElementById('catalogue-status');

function renderProduct(product) {
  const item = document.createElement('li');
  item.className = 'product-card';

  const title = document.createElement('h2');
  title.textContent = product.title;

  const price = document.createElement('p');
  price.textContent = formatMoney(product.priceMinor, product.currency);

  const description = document.createElement('p');
  description.className = 'muted';
  description.textContent = product.description.slice(0, 140);

  const link = document.createElement('a');
  link.href = `/checkout.html?product=${encodeURIComponent(product.id)}`;
  link.textContent = 'Buy now';

  item.append(title, price, description, link);
  return item;
}

try {
  const products = await api('/api/products?limit=24');

  if (!products || products.length === 0) {
    status.textContent = 'No products are listed yet.';
  } else {
    status.textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
    for (const product of products) {
      list.append(renderProduct(product));
    }
  }
} catch (error) {
  status.textContent = error.message || 'Could not load products.';
}
