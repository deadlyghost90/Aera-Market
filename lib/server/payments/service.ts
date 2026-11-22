import { env } from '../config/env';
import { AppError, badRequest, forbidden, notFound } from '../utils/errors';
import { newId, paymentIdempotencyKey } from '../utils/ids';
import { logger } from '../utils/logger';
import { splitCommission } from '../utils/money';
import { writeAudit } from '../security/audit';
import { getGateway } from './registry';
import { allocateBySeller } from './allocation';
import type { Payment, Order, OrderItem } from '../../shared/types';
import type { PaymentStatus } from '../../shared/enums';
import type { TransitionSource } from './state';
import { isPaidStatus, isRefundableStatus } from './state';
import { requireOrder } from '../database/orders.repo';
import {
  claimIdempotencyKey,
  createPayment,
  getPayment,
  listPaymentsByOrder,
  requirePayment,
  transitionPayment,
  registerTracker
} from '../database/payments.repo';
import { attachPayment } from '../database/orders.repo';
import { applySellerDelta } from '../database/ledger.repo';
import { writePaymentEventOnly, writeSettlement } from '../database/settlement.repo';
import type { LedgerEntry } from '../../shared/types';

export interface InitiateResult {
  payment: Payment;
  checkoutUrl: string;
  reused: boolean;
}

/**
 * Commission is taken from the author's own rate when the order belongs to a
 * single seller, otherwise the platform default applies to the whole order.
 */
async function resolveCommissionPercent(order: Order): Promise<number> {
  const sellerIds = [...new Set(order.items.map((item) => item.sellerId))];
  if (sellerIds.length !== 1) return env().PLATFORM_COMMISSION_PERCENT;

  const { getSeller } = await import('../database/sellers.repo');
  const seller = await getSeller(sellerIds[0] as string);
  if (!seller || seller.status !== 'APPROVED') return env().PLATFORM_COMMISSION_PERCENT;
  return seller.commissionPercent;
}

/**
 * Creates (or resumes) the payment for an order and returns the hosted
 * checkout URL. The client can retry freely: the idempotency key guarantees a
 * single gateway charge per order.
 */
export async function initiatePayment(input: {
  orderId: string;
  userId: string;
  ipHash?: string;
}): Promise<InitiateResult> {
  const config = env();
  if (!config.PAYMENTS_ENABLED) {
    throw new AppError('PAYMENTS_DISABLED', 'Payments are temporarily unavailable');
  }

  const order = await requireOrder(input.orderId);
  if (order.buyerId !== input.userId) throw forbidden('This order belongs to another customer');
  if (order.status !== 'PENDING_PAYMENT') {
    throw new AppError('CONFLICT', `Order is ${order.status.toLowerCase().replace(/_/g, ' ')}`);
  }
  if (order.items.length === 0) throw badRequest('Order has no items');

  const existing = await listPaymentsByOrder(order.id);
  const open = existing.find(
    (payment) => payment.status === 'CREATED' || payment.status === 'PENDING' || payment.status === 'PROCESSING'
  );
  if (open?.checkoutUrl) {
    return { payment: open, checkoutUrl: open.checkoutUrl, reused: true };
  }
  if (existing.some((payment) => isPaidStatus(payment.status))) {
    throw new AppError('CONFLICT', 'This order has already been paid');
  }

  const commissionPercent = await resolveCommissionPercent(order);
  const { commissionMinor, sellerPayableMinor } = splitCommission(order.totalMinor, commissionPercent);
  const firstItem = order.items[0] as OrderItem;
  const productName =
    order.items.length === 1 ? firstItem.productName : `${firstItem.productName} +${order.items.length - 1} more`;

  const paymentId = newId('pay');
  const idempotencyKey = paymentIdempotencyKey(order.id, input.userId);
  const claim = await claimIdempotencyKey(idempotencyKey, paymentId);

  if (!claim.claimed) {
    if (claim.existingPaymentId) {
      const previous = await getPayment(claim.existingPaymentId);
      if (previous?.checkoutUrl) {
        return { payment: previous, checkoutUrl: previous.checkoutUrl, reused: true };
      }
      if (previous) {
        throw new AppError('CONFLICT', 'A payment attempt already exists for this order');
      }
    }
    throw new AppError('IDEMPOTENCY_CONFLICT', 'Duplicate payment request');
  }

  const now = Date.now();
  const payment: Payment = {
    id: paymentId,
    orderId: order.id,
    userId: input.userId,
    productId: firstItem.productId,
    productName,
    gateway: 'safepay',
    gatewayEnvironment: config.FASTPAY_ENVIRONMENT,
    gatewayTrackerId: null,
    gatewayTransactionId: null,
    gatewayReference: null,
    gatewayResponseRef: null,
    checkoutUrl: null,
    paymentMethod: null,
    status: 'CREATED',
    amountMinor: order.totalMinor,
    refundedAmountMinor: 0,
    refundStatus: null,
    currency: order.currency,
    commissionPercent,
    commissionMinor,
    sellerPayableMinor,
    failureReason: null,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lastStatusAt: now
  };

  await createPayment(payment);
  await writePaymentEventOnly({
    paymentId,
    type: 'PAYMENT_CREATED',
    fromStatus: null,
    toStatus: 'CREATED',
    actor: input.userId,
    source: 'api'
  });

  const gateway = getGateway('safepay');

  let tracker: string;
  let checkoutUrl: string;
  try {
    const result = await gateway.initiatePayment({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      orderId: order.id,
      paymentId
    });
    tracker = result.tracker;
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    await transitionPayment({
      paymentId,
      to: 'FAILED',
      source: 'api',
      patch: {
        failureReason: error instanceof Error ? error.message : 'Gateway initiation failed'
      }
    }).catch(() => undefined);

    await writePaymentEventOnly({
      paymentId,
      type: 'PAYMENT_FAILED',
      fromStatus: 'CREATED',
      toStatus: 'FAILED',
      actor: 'system',
      source: 'api',
      message: 'Gateway did not accept the payment request'
    });

    logger.error('payment_initiate_failed', { paymentId, orderId: order.id });
    throw error;
  }

  await registerTracker(tracker, paymentId);

  const { payment: pending } = await transitionPayment({
    paymentId,
    to: 'PENDING',
    source: 'api',
    patch: { gatewayTrackerId: tracker, checkoutUrl }
  });

  await writePaymentEventOnly({
    paymentId,
    type: 'PAYMENT_INITIATED',
    fromStatus: 'CREATED',
    toStatus: 'PENDING',
    actor: input.userId,
    source: 'api',
    message: 'Hosted checkout session created'
  });

  await attachPayment(order.id, paymentId);

  await writeAudit({
    actorUid: input.userId,
    action: 'payment.initiated',
    targetType: 'payment',
    targetId: paymentId,
    meta: {
      orderId: order.id,
      amountMinor: payment.amountMinor,
      gateway: 'safepay',
      environment: config.FASTPAY_ENVIRONMENT
    },
    ipHash: input.ipHash ?? null
  });

  return { payment: pending, checkoutUrl, reused: false };
}

/**
 * Marks a payment as PAID and writes the ledger, commission and seller balance
 * in one pass. Safe to call repeatedly: only the first call settles.
 */
export async function settlePayment(input: {
  paymentId: string;
  source: TransitionSource;
  transactionId?: string | null;
  reference?: string | null;
  paymentMethod?: string | null;
  gatewayState?: string | null;
  actor?: string;
}): Promise<{ payment: Payment; settled: boolean }> {
  const payment = await requirePayment(input.paymentId);
  const order = await requireOrder(payment.orderId);

  if (isPaidStatus(payment.status)) {
    return { payment, settled: false };
  }

  const { applied, payment: updated } = await transitionPayment({
    paymentId: payment.id,
    to: 'PAID',
    source: input.source,
    patch: {
      gatewayTransactionId: input.transactionId ?? payment.gatewayTransactionId,
      gatewayReference: input.reference ?? payment.gatewayReference,
      gatewayResponseRef: input.gatewayState ?? payment.gatewayResponseRef,
      paymentMethod: input.paymentMethod ?? payment.paymentMethod,
      checkoutUrl: null
    }
  });

  if (!applied) {
    const latest = await getPayment(payment.id);
    if (!latest) throw notFound('Payment not found');
    return { payment: latest, settled: false };
  }

  const allocations = allocateBySeller(order.items, payment.commissionPercent);
  const entries: Omit<LedgerEntry, 'id'>[] = [];

  for (const allocation of allocations) {
    entries.push({
      paymentId: payment.id,
      orderId: order.id,
      sellerId: allocation.sellerId,
      type: 'SALE',
      amountMinor: allocation.subtotalMinor,
      currency: payment.currency,
      createdAt: Date.now()
    });
    entries.push({
      paymentId: payment.id,
      orderId: order.id,
      sellerId: allocation.sellerId,
      type: 'COMMISSION',
      amountMinor: -allocation.commissionMinor,
      currency: payment.currency,
      createdAt: Date.now()
    });
    // Platform-side revenue row (excluded from seller balances).
    entries.push({
      paymentId: payment.id,
      orderId: order.id,
      sellerId: 'platform',
      type: 'COMMISSION',
      amountMinor: allocation.commissionMinor,
      currency: payment.currency,
      createdAt: Date.now()
    });
  }

  await writeSettlement({
    paymentId: payment.id,
    orderId: order.id,
    buyerId: order.buyerId,
    orderStatus: 'FULFILLED',
    entries,
    event: {
      type: 'PAYMENT_PAID',
      fromStatus: payment.status,
      toStatus: 'PAID',
      actor: input.actor ?? 'gateway',
      source: input.source === 'gateway_webhook' ? 'gateway_webhook' : 'gateway_redirect',
      message: `Verified by gateway (${input.gatewayState ?? 'paid'})`
    }
  });

  for (const allocation of allocations) {
    await applySellerDelta({
      sellerId: allocation.sellerId,
      appliedKey: `sale:${payment.id}`,
      availableDelta: allocation.sellerPayableMinor,
      lifetimeDelta: allocation.sellerPayableMinor,
      currency: payment.currency
    });
  }

  await writeAudit({
    actorUid: input.actor ?? 'system',
    action: 'payment.paid',
    targetType: 'payment',
    targetId: payment.id,
    meta: {
      orderId: order.id,
      amountMinor: payment.amountMinor,
      commissionMinor: payment.commissionMinor,
      source: input.source
    }
  });

  logger.info('payment_paid', {
    paymentId: payment.id,
    orderId: order.id,
    amountMinor: payment.amountMinor
  });

  return { payment: updated, settled: true };
}

export async function markPaymentFailed(input: {
  paymentId: string;
  reason: string;
  source: TransitionSource;
  status?: Extract<PaymentStatus, 'FAILED' | 'CANCELLED'>;
}): Promise<Payment> {
  const payment = await requirePayment(input.paymentId);
  if (isPaidStatus(payment.status)) return payment;

  const target = input.status ?? 'FAILED';
  const { applied, payment: updated } = await transitionPayment({
    paymentId: payment.id,
    to: target,
    source: input.source,
    patch: { failureReason: input.reason.slice(0, 300), checkoutUrl: null }
  }).catch(async (error: unknown) => {
    if (error instanceof AppError && error.code === 'INVALID_TRANSITION') {
      const latest = await requirePayment(payment.id);
      return { applied: false, payment: latest };
    }
    throw error;
  });

  if (applied) {
    await writePaymentEventOnly({
      paymentId: payment.id,
      type: target === 'CANCELLED' ? 'PAYMENT_CANCELLED' : 'PAYMENT_FAILED',
      fromStatus: payment.status,
      toStatus: target,
      actor: 'system',
      source: input.source === 'gateway_webhook' ? 'gateway_webhook' : 'api',
      message: input.reason.slice(0, 300)
    });
  }

  return updated;
}

/**
 * Server-side verification against the gateway. The browser can ask "is this
 * paid?" but only the gateway answer can settle the payment.
 */
export async function syncPaymentWithGateway(
  paymentId: string,
  source: TransitionSource = 'api'
): Promise<{ payment: Payment; gatewayState: string }> {
  const payment = await requirePayment(paymentId);
  if (!payment.gatewayTrackerId) {
    return { payment, gatewayState: 'NO_TRACKER' };
  }

  const gateway = getGateway(payment.gateway);
  const tracker = await gateway.fetchTracker(payment.gatewayTrackerId);

  if (tracker.amountMinor !== null && tracker.amountMinor !== payment.amountMinor) {
    logger.error('payment_amount_mismatch', {
      paymentId,
      expected: payment.amountMinor,
      received: tracker.amountMinor
    });
    await writeAudit({
      actorUid: 'system',
      action: 'payment.amount_mismatch',
      targetType: 'payment',
      targetId: paymentId,
      meta: { expected: payment.amountMinor, received: tracker.amountMinor }
    });
    return { payment, gatewayState: tracker.rawState };
  }

  if (tracker.isPaid) {
    const { payment: settled } = await settlePayment({
      paymentId,
      source,
      transactionId: tracker.transactionId,
      reference: tracker.reference,
      gatewayState: tracker.rawState
    });
    return { payment: settled, gatewayState: tracker.rawState };
  }

  if (tracker.isCancelled) {
    const updated = await markPaymentFailed({
      paymentId,
      reason: 'Customer cancelled the payment',
      source,
      status: 'CANCELLED'
    });
    return { payment: updated, gatewayState: tracker.rawState };
  }

  if (tracker.isFailed) {
    const updated = await markPaymentFailed({
      paymentId,
      reason: `Gateway reported ${tracker.rawState}`,
      source
    });
    return { payment: updated, gatewayState: tracker.rawState };
  }

  return { payment, gatewayState: tracker.rawState };
}

export function assertRefundable(payment: Payment): void {
  if (!isRefundableStatus(payment.status)) {
    throw new AppError('CONFLICT', `A ${payment.status} payment cannot be refunded`);
  }
}
