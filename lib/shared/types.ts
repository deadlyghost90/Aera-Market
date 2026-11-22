import type {
  GatewayId,
  LedgerEntryType,
  OrderStatus,
  PaymentEventType,
  PaymentStatus,
  ProductStatus,
  RefundStatus,
  Role,
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

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  slug: string;
  description: string;
  priceMinor: number;
  currency: string;
  status: ProductStatus;
  categoryId: string | null;
  createdAt: number;
  updatedAt: number;
}

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

/**
 * A permanent financial record. It is never deleted when a buyer removes an
 * order from their own history, and it is the single source of truth for
 * money movement.
 */
export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  /** Snapshot fields - they must not change if the product is edited later. */
  productId: string;
  productName: string;
  gateway: GatewayId;
  gatewayEnvironment: 'sandbox' | 'production';
  gatewayTrackerId: string | null;
  gatewayTransactionId: string | null;
  gatewayReference: string | null;
  gatewayResponseRef: string | null;
  /** Hosted checkout URL for the current tracker, so retries resume safely. */
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
  /** Signed: positive credits the seller, negative debits. */
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
