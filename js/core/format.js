const currencyFormatters = new Map();

function formatter(currency) {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(
      currency,
      new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2
      })
    );
  }
  return currencyFormatters.get(currency);
}

/** Minor units (paisa) to a localised currency string. */
export function formatMoney(amountMinor, currency = 'PKR') {
  const major = Number(amountMinor) / 100;
  return formatter(currency).format(Number.isFinite(major) ? major : 0);
}

/** Major units from a form input to integer minor units. */
export function toMinor(value) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

export function formatDate(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

export function labelStatus(status) {
  return String(status || '')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
