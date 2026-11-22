import { currentSession, api } from './api.js';

/** Formats integer minor units as PKR. */
export function money(amountMinor, currency = 'PKR') {
  const major = Number(amountMinor || 0) / 100;
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(major);
}

export function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const value = Math.floor(seconds / size);
      return `${value} ${name}${value === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

export function statusBadge(status) {
  const map = {
    DRAFT: 'badge',
    PENDING_REVIEW: 'badge badge-warn',
    CHANGES_REQUESTED: 'badge badge-warn',
    APPROVED: 'badge badge-ok',
    REJECTED: 'badge badge-bad',
    SUSPENDED: 'badge badge-bad',
    PENDING: 'badge badge-warn',
    PAID: 'badge badge-ok',
    FAILED: 'badge badge-bad'
  };
  return map[status] ?? 'badge';
}

export function label(status) {
  return String(status || '')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function toast(message, type = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.append(host);
  }
  const node = document.createElement('div');
  node.className = `toast ${type === 'err' ? 'err' : ''}`;
  node.textContent = message;
  host.append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function navLink(href, text, active) {
  const link = document.createElement('a');
  link.className = 'nav-link';
  link.href = href;
  link.textContent = text;
  if (active === href) link.setAttribute('aria-current', 'page');
  return link;
}

/** Injects the shared header and footer so pages stay small. */
export async function mountShell(active = '') {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  const session = await currentSession();

  if (header) {
    header.className = 'site-header';
    const wrap = document.createElement('div');
    wrap.className = 'container';

    const brand = document.createElement('a');
    brand.href = '/index.html';
    brand.className = 'brand';
    const mark = document.createElement('span');
    mark.className = 'brand-mark';
    brand.append(mark, document.createTextNode('Aera Market'));

    const nav = document.createElement('nav');
    nav.className = 'nav-links';
    nav.append(
      navLink('/explore.html', 'Explore', active),
      navLink('/index.html#how', 'How it works', active)
    );

    if (session) {
      nav.append(navLink('/seller-dashboard.html', session.role === 'ADMIN' ? 'Author hub' : 'Sell', active));
      nav.append(navLink('/seller-earnings.html', 'Earnings', active));
      if (session.role === 'ADMIN') {
        nav.append(navLink('/admin-review.html', 'Review queue', active));
        nav.append(navLink('/admin-authors.html', 'Authors', active));
        nav.append(navLink('/admin-categories.html', 'Categories', active));
      }
      nav.append(navLink('/buyer-library.html', 'Library', active));
      nav.append(navLink('/buyer-payments.html', 'Purchases', active));

      const signOut = document.createElement('button');
      signOut.type = 'button';
      signOut.className = 'btn btn-ghost btn-sm';
      signOut.textContent = 'Sign out';
      signOut.addEventListener('click', async () => {
        await api('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
        window.location.assign('/index.html');
      });
      nav.append(signOut);
    } else {
      nav.append(navLink('/login.html', 'Sign in', active));
      const cta = document.createElement('a');
      cta.href = '/register.html';
      cta.className = 'btn btn-primary btn-sm';
      cta.textContent = 'Start selling';
      nav.append(cta);
    }

    wrap.append(brand, nav);
    header.replaceChildren(wrap);
  }

  if (footer) {
    footer.className = 'site-footer';
    const wrap = document.createElement('div');
    wrap.className = 'container';

    const left = document.createElement('span');
    left.textContent = 'Â© Aera Intelligence (Pvt) Ltd.';

    const right = document.createElement('span');
    right.textContent = 'Every product is reviewed before it goes live.';

    wrap.append(left, right);
    footer.replaceChildren(wrap);
  }

  return session;
}
