/**
 * Domain enumerations shared by API, tests and documentation.
 * Plain const objects (not TS enums) so they survive compilation to CommonJS.
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

export const COMING_SOON_GATEWAYS = ['stripe', 'paypal', 'jazzcash', 'easypaisa'] as const;

/* ------------------------------------------------------------------ */
/* Seller (author) model: any buyer may apply, admins approve.          */
/* ------------------------------------------------------------------ */

export const SELLER_STATUS = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const;
export type SellerStatus = (typeof SELLER_STATUS)[number];

/* ------------------------------------------------------------------ */
/* Product lifecycle: Envato-style submission and review.               */
/* ------------------------------------------------------------------ */

export const PRODUCT_STATUS = [
  'DRAFT',
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

/** What the seller *claims* they are selling. Files are checked against it. */
export const PRODUCT_KIND = [
  'SOURCE_CODE',
  'WEBSITE_TEMPLATE',
  'SCRIPT_AUTOMATION',
  'PLUGIN_EXTENSION',
  'API_TOOL',
  'SOFTWARE_APP',
  'MINECRAFT_RESOURCE',
  'GAME_ASSET',
  'UI_KIT',
  'GRAPHICS',
  'OTHER'
] as const;
export type ProductKind = (typeof PRODUCT_KIND)[number];

export const LICENSE_TYPE = ['STANDARD', 'EXTENDED'] as const;
export type LicenseType = (typeof LICENSE_TYPE)[number];

export const REVIEW_DECISION = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'] as const;
export type ReviewDecision = (typeof REVIEW_DECISION)[number];

/** Envato-style rejection reasons, shown to the seller. */
export const REJECTION_REASONS = [
  'FILES_DO_NOT_MATCH_DESCRIPTION',
  'QUALITY_BELOW_STANDARD',
  'INCOMPLETE_PACKAGE',
  'MISSING_DOCUMENTATION',
  'LICENSE_OR_COPYRIGHT_ISSUE',
  'PROHIBITED_CONTENT',
  'DUPLICATE_SUBMISSION',
  'MISLEADING_PREVIEW',
  'TECHNICAL_ERRORS',
  'OTHER'
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];
