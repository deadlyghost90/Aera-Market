/**
 * Domain enumerations shared by API, tests and documentation.
 * Plain const objects (not TS enums) so they survive compilation to CommonJS
 * and can be imported anywhere without runtime helpers.
 */

export const ROLES = ['BUYER', 'SELLER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUS = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const PAYMENT_STATUS = [
  'CREATED',
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED'
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const ORDER_STATUS = [
  'PENDING_PAYMENT',
  'PAID',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED'
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const REFUND_STATUS = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'FAILED'
] as const;
export type RefundStatus = (typeof REFUND_STATUS)[number];

export const PAYMENT_EVENT_TYPE = [
  'PAYMENT_CREATED',
  'PAYMENT_INITIATED',
  'PAYMENT_PENDING',
  'PAYMENT_PAID',
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'REFUND_REQUESTED',
  'REFUND_APPROVED',
  'REFUND_REJECTED',
  'REFUND_COMPLETED',
  'STATUS_CHANGED'
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPE)[number];

export const LEDGER_ENTRY_TYPE = [
  'SALE',
  'COMMISSION',
  'REFUND',
  'COMMISSION_REVERSAL'
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPE)[number];

export const GATEWAY_ID = ['safepay'] as const;
export type GatewayId = (typeof GATEWAY_ID)[number];

/** Gateways that are wired but not yet launched. Rendered as "Coming Soon". */
export const COMING_SOON_GATEWAYS = ['stripe', 'paypal', 'jazzcash', 'easypaisa'] as const;

export const PRODUCT_STATUS = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];
