import { AppError, badRequest, forbidden, notFound } from '../utils/errors';
import { remainingRefundableMinor, toMinorUnits } from '../utils/money';
import { writeAudit } from '../security/audit';
import { logger } from '../utils/logger';
import { statusAfterRefund } from './state';
import { assertRefundable } from './service';
import {
  createRefundInput,
  findOpenRefund,
  getRefund,
  listRefundsByPayment,
  requireRefund,
  updateRefund
} from '../database/refunds.repo';
import { requirePayment, transitionPayment } from '../database/payments.repo';
import { requireOrder } from '../database/orders.repo';
import { applySellerDelta } from '../database/ledger.repo';
import { writePaymentEventOnly, writeSettlement } from '../database/settlement.repo';
import { buildRefundLedger } from './allocation';
import type { Payment, Refund } from '../../shared/types';

export async function requestRefund(input: {
  paymentId: string;
  userId: string;
  amountMinor?: number;
  reason: string;
  ipHash?: string;
}): Promise<Refund> {
  const payment = await requirePayment(input.paymentId);
  if (payment.userId !== input.userId) throw forbidden('This payment belongs to another customer');
  assertRefundable(payment);

  const remaining = remainingRefundableMinor(payment.amountMinor, payment.refundedAmountMinor);
  if (remaining <= 0) throw new AppError('CONFLICT', 'This payment has already been fully refunded');

  const amountMinor = input.amountMinor ?? remaining;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw badRequest('Refund amount must be a positive integer in minor units');
  }
  if (amountMinor > remaining) {
    throw new AppError('REFUND_EXCEEDS_BALANCE', 'Refund amount exceeds the refundable balance', {
      remaining
    });
  }

  const open = await findOpenRefund(payment.id);
  if (open) throw new AppError('CONFLICT', 'A refund request for this payment is already open');

  const refund = await createRefundInput({
    paymentId: payment.id,
    orderId: payment.orderId,
    userId: input.userId,
    amountMinor,
    currency: payment.currency,
    reason: input.reason.slice(0, 500),
    requestedBy: input.userId
  });

  await transitionPayment({
    paymentId: payment.id,
    to: 'REFUND_PENDING',
    source: 'api',
    patch: { refundStatus: 'REQUESTED' }
  });

  await writePaymentEventOnly({
    paymentId: payment.id,
    type: 'REFUND_REQUESTED',
    fromStatus: payment.status,
    toStatus: 'REFUND_PENDING',
    actor: input.userId,
    source: 'api',
    message: `Refund requested: ${amountMinor} ${payment.currency} minor units`
  });

  await writeAudit({
    actorUid: input.userId,
    action: 'refund.requested',
    targetType: 'refund',
    targetId: refund.id,
    meta: { paymentId: payment.id, amountMinor },
    ipHash: input.ipHash ?? null
  });

  return refund;
}

export type RefundAction = 'approve' | 'reject' | 'complete';

export async function decideRefund(input: {
  refundId: string;
  adminUid: string;
  action: RefundAction;
  note?: string;
  gatewayRefundId?: string;
}): Promise<{ refund: Refund; payment: Payment }> {
  const refund = await requireRefund(input.refundId);
  const payment = await requirePayment(refund.paymentId);

  if (input.action === 'approve') {
    if (refund.status !== 'REQUESTED') {
      throw new AppError('CONFLICT', `Refund is ${refund.status}, it cannot be approved`);
    }
    const updated = await updateRefund(refund.id, {
      status: 'APPROVED',
      decidedBy: input.adminUid,
      decisionNote: input.note?.slice(0, 500) ?? null
    });

    await writePaymentEventOnly({
      paymentId: payment.id,
      type: 'REFUND_APPROVED',
      fromStatus: payment.status,
      toStatus: payment.status,
      actor: input.adminUid,
      source: 'admin',
      message: input.note?.slice(0, 300) ?? null
    });

    await writeAudit({
      actorUid: input.adminUid,
      action: 'refund.approved',
      targetType: 'refund',
      targetId: refund.id,
      meta: { paymentId: payment.id, amountMinor: refund.amountMinor }
    });

    return { refund: updated, payment };
  }

  if (input.action === 'reject') {
    if (refund.status !== 'REQUESTED' && refund.status !== 'APPROVED') {
      throw new AppError('CONFLICT', `Refund is ${refund.status}, it cannot be rejected`);
    }

    const updated = await updateRefund(refund.id, {
      status: 'REJECTED',
      decidedBy: input.adminUid,
      decisionNote: input.note?.slice(0, 500) ?? null
    });

    const target = statusAfterRefund(payment.amountMinor, payment.refundedAmountMinor);
    const { payment: reverted } = await transitionPayment({
      paymentId: payment.id,
      to: target,
      source: 'admin',
      patch: { refundStatus: 'REJECTED' }
    });

    await writePaymentEventOnly({
      paymentId: payment.id,
      type: 'REFUND_REJECTED',
      fromStatus: payment.status,
      toStatus: target,
      actor: input.adminUid,
      source: 'admin',
      message: input.note?.slice(0, 300) ?? null
    });

    await writeAudit({
      actorUid: input.adminUid,
      action: 'refund.rejected',
      targetType: 'refund',
      targetId: refund.id,
      meta: { paymentId: payment.id }
    });

    return { refund: updated, payment: reverted };
  }

  // complete
  if (refund.status !== 'APPROVED') {
    throw new AppError('CONFLICT', 'Only an approved refund can be completed');
  }

  const newRefundedMinor = payment.refundedAmountMinor + refund.amountMinor;
  if (newRefundedMinor > payment.amountMinor) {
    throw new AppError('REFUND_EXCEEDS_BALANCE', 'Refund exceeds the captured amount');
  }

  const target = statusAfterRefund(payment.amountMinor, newRefundedMinor);

  const { applied, payment: updatedPayment } = await transitionPayment({
    paymentId: payment.id,
    to: target,
    source: 'admin',
    patch: {
      refundedAmountMinor: newRefundedMinor,
      refundStatus: 'COMPLETED'
    }
  });

  if (!applied) {
    const latest = await requirePayment(payment.id);
    const updatedRefund = await getRefund(refund.id);
    if (!updatedRefund) throw notFound('Refund not found');
    return { refund: updatedRefund, payment: latest };
  }

  const order = await requireOrder(payment.orderId);
  const entries = buildRefundLedger(payment, order.items, refund.amountMinor, order.totalMinor);

  const updated = await updateRefund(refund.id, {
    status: 'COMPLETED',
    decidedBy: input.adminUid,
    decisionNote: input.note?.slice(0, 500) ?? refund.decisionNote,
    gatewayRefundId: input.gatewayRefundId?.slice(0, 120) ?? null,
    completedAt: Date.now()
  });

  await writeSettlement({
    paymentId: payment.id,
    orderId: order.id,
    buyerId: order.buyerId,
    orderStatus: newRefundedMinor >= payment.amountMinor ? 'REFUNDED' : 'FULFILLED',
    entries,
    event: {
      type: 'REFUND_COMPLETED',
      fromStatus: payment.status,
      toStatus: target,
      actor: input.adminUid,
      source: 'admin',
      message: `Refunded ${refund.amountMinor} ${payment.currency} minor units`
    }
  });

  for (const entry of entries) {
    if (entry.sellerId === 'platform' || entry.type !== 'REFUND') continue;
    await applySellerDelta({
      sellerId: entry.sellerId,
      appliedKey: `refund:${refund.id}:${entry.sellerId}`,
      availableDelta: entry.amountMinor, // already negative
      lifetimeDelta: 0,
      currency: payment.currency
    });
  }

  await writeAudit({
    actorUid: input.adminUid,
    action: 'refund.completed',
    targetType: 'refund',
    targetId: refund.id,
    meta: {
      paymentId: payment.id,
      amountMinor: refund.amountMinor,
      newRefundedMinor
    }
  });

  // A fully refunded product is no longer owned, so download access is removed.
  if (newRefundedMinor >= payment.amountMinor) {
    const { revokePurchase } = await import('../database/purchases.repo');
    await revokePurchase(payment.userId, payment.productId).catch(() => undefined);
  }

  logger.info('refund_completed', {
    refundId: refund.id,
    paymentId: payment.id,
    amountMinor: refund.amountMinor
  });

  return { refund: updated, payment: updatedPayment };
}

export async function listRefundsForPayment(paymentId: string): Promise<Refund[]> {
  return listRefundsByPayment(paymentId);
}

export function toMinorOrThrow(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest('Amount must be a number');
  }
  return toMinorUnits(value);
}
