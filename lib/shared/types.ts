import type {
  GatewayId,
  LedgerEntryType,
  LicenseType,
  OrderStatus,
  PaymentEventType,
  PaymentStatus,
  ProductKind,
  ProductStatus,
  RefundStatus,
  RejectionReason,
  ReviewDecision,
  Role,
  SellerStatus,
  UserStatus
} from './enums';

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Authors / sellers                                                   */
/* ------------------------------------------------------------------ */

export interface Seller {
  uid: string;
  displayName: string;
  bio: string;
  country: string;
  status: SellerStatus;
  /** Platform commission for this author (defaults to the global rate). */
  commissionPercent: number;
  payoutMethod: string | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  stats: {
    products: number;
    sales: number;
    grossMinor: number;
  };
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Product kinds accepted in this category. */
  allowedKinds: ProductKind[];
  /** Lower-case extensions accepted for delivery files. */
  allowedExtensions: string[];
  maxFileMb: number;
  minPriceMinor: number;
  sort: number;
  active: boolean;
}

export interface ProductFile {
  id: string;
  /** Storage key inside the private bucket. */
  key: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: number;
  verified: boolean;
}

export interface ReviewCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Blocking failures stop submission; warnings only inform the reviewer. */
  blocking: boolean;
  detail: string;
}

export interface ReviewRecord {
  submittedAt: number;
  automatedPassed: boolean;
  checks: ReviewCheck[];
  reviewerId: string | null;
  decidedAt: number | null;
  decision: ReviewDecision | null;
  note: string | null;
  reason: RejectionReason | null;
}

export interface Product {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  categoryId: string;
  kind: ProductKind;
  license: LicenseType;
  tags: string[];
  priceMinor: number;
  currency: string;
  status: ProductStatus;
  files: ProductFile[];
  previewUrl: string | null;
  demoUrl: string | null;
  documentationUrl: string | null;
  review: ReviewRecord | null;
  rejectionNote: string | null;
  salesCount: number;
  rating: number;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
}

/* ------------------------------------------------------------------ */
/* Orders, payments, refunds (unchanged shape)                         */
/* ------------------------------------------------------------------ */

export interface OrderItem {
  productId: string;
  productName: string;
  sellerId: string;
  unitPriceMinor: number;
  quantity: number;
}

export interface Order {
  id: string;
  buyerId: string;
  items: OrderItem[];
  subtotalMinor: number;
  totalMinor: number;
  currency: string;
  status: OrderStatus;
  paymentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  productId: string;
  productName: string;
  gateway: GatewayId;
  gatewayEnvironment: 'sandbox' | 'production';
  gatewayTrackerId: string | null;
  gatewayTransactionId: string | null;
  gatewayReference: string | null;
  gatewayResponseRef: string | null;
  checkoutUrl: string | null;
  paymentMethod: string | null;
  status: PaymentStatus;
  amountMinor: number;
  refundedAmountMinor: number;
  refundStatus: RefundStatus | null;
  currency: string;
  commissionPercent: number;
  commissionMinor: number;
  sellerPayableMinor: number;
  failureReason: string | null;
  idempotencyKey: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  lastStatusAt: number;
}

export interface PaymentEvent {
  id: string;
  paymentId: string;
  type: PaymentEventType;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  actor: string;
  source: 'api' | 'gateway_redirect' | 'gateway_webhook' | 'admin' | 'system';
  message: string | null;
  createdAt: number;
}

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  userId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  gatewayRefundId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface LedgerEntry {
  id: string;
  paymentId: string;
  orderId: string;
  sellerId: string;
  type: LedgerEntryType;
  amountMinor: number;
  currency: string;
  createdAt: number;
}

export interface SellerBalance {
  sellerId: string;
  availableMinor: number;
  pendingMinor: number;
  lifetimeMinor: number;
  currency: string;
  updatedAt: number;
}

/** Proof that a buyer owns a product, created when a payment settles. */
export interface Purchase {
  id: string;
  userId: string;
  productId: string;
  orderId: string;
  productName: string;
  sellerId: string;
  priceMinor: number;
  currency: string;
  grantedAt: number;
  downloadCount: number;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  meta: Record<string, string | number | boolean | null>;
  ipHash: string | null;
  createdAt: number;
}
