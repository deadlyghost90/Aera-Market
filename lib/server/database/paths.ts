/**
 * Canonical Realtime Database paths. Every path is built here so that user
 * supplied ids are validated once, in one place, and can never be used for
 * path injection.
 */

export const PATHS = {
  users: 'users',
  products: 'products',
  orders: 'orders',
  ordersByBuyer: 'ordersByBuyer',
  payments: 'payments',
  paymentsByUser: 'paymentsByUser',
  paymentsByOrder: 'paymentsByOrder',
  paymentEvents: 'paymentEvents',
  gatewayTrackers: 'gatewayTrackers',
  refunds: 'refunds',
  refundsByUser: 'refundsByUser',
  ledger: 'ledger',
  sellerBalances: 'sellerBalances',
  auditLogs: 'auditLogs',
  idempotency: 'idempotency',
  webhookEvents: 'webhookEvents',
  rateLimits: 'rateLimits',
  configPublic: 'config/public',
  configAdmin: 'config/admin'
} as const;

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Rejects anything that could escape its path segment (dots, slashes, control chars). */
export function assertSafeId(value: string, label = 'id'): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export const userPath = (uid: string) => `${PATHS.users}/${assertSafeId(uid, 'uid')}`;
export const productPath = (id: string) => `${PATHS.products}/${assertSafeId(id, 'product id')}`;
export const orderPath = (id: string) => `${PATHS.orders}/${assertSafeId(id, 'order id')}`;
export const paymentPath = (id: string) => `${PATHS.payments}/${assertSafeId(id, 'payment id')}`;
export const refundPath = (id: string) => `${PATHS.refunds}/${assertSafeId(id, 'refund id')}`;
export const ledgerPath = (id: string) => `${PATHS.ledger}/${assertSafeId(id, 'ledger id')}`;
export const balancePath = (sellerId: string) =>
  `${PATHS.sellerBalances}/${assertSafeId(sellerId, 'seller id')}`;
export const trackerPath = (tracker: string) =>
  `${PATHS.gatewayTrackers}/${assertSafeId(tracker, 'tracker')}`;
export const eventPath = (paymentId: string, eventId: string) =>
  `${PATHS.paymentEvents}/${assertSafeId(paymentId, 'payment id')}/${assertSafeId(
    eventId,
    'event id'
  )}`;
export const idempotencyPath = (key: string) =>
  `${PATHS.idempotency}/${assertSafeId(key, 'idempotency key')}`;
export const webhookEventPath = (provider: string, eventId: string) =>
  `${PATHS.webhookEvents}/${assertSafeId(provider, 'provider')}/${assertSafeId(
    eventId,
    'event id'
  )}`;
export const rateLimitPath = (key: string) => `${PATHS.rateLimits}/${assertSafeId(key, 'rate key')}`;
