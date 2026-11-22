import { db } from '../firebase/admin';
import {
  PATHS,
  eventPath,
  idempotencyPath,
  paymentPath,
  trackerPath,
  webhookEventPath
} from './paths';
import type { Payment, PaymentEvent } from '../../shared/types';
import type { PaymentEventType, PaymentStatus } from '../../shared/enums';
import { AppError, notFound } from '../utils/errors';
import { newId } from '../utils/ids';
import { assertTransition, canTransition, type TransitionSource } from '../payments/state';

function toPayment(value: unknown, id: string): Payment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id,
    orderId: String(record.orderId ?? ''),
    userId: String(record.userId ?? ''),
    productId: String(record.productId ?? ''),
    productName: String(record.productName ?? ''),
    gateway: (record.gateway as Payment['gateway']) ?? 'safepay',
    gatewayEnvironment: (record.gatewayEnvironment as Payment['gatewayEnvironment']) ?? 'sandbox',
    gatewayTrackerId: (record.gatewayTrackerId as string | null) ?? null,
    gatewayTransactionId: (record.gatewayTransactionId as string | null) ?? null,
    gatewayReference: (record.gatewayReference as string | null) ?? null,
    gatewayResponseRef: (record.gatewayResponseRef as string | null) ?? null,
    checkoutUrl: (record.checkoutUrl as string | null) ?? null,
    paymentMethod: (record.paymentMethod as string | null) ?? null,
    status: (record.status as PaymentStatus) ?? 'CREATED',
    amountMinor: Number(record.amountMinor ?? 0),
    refundedAmountMinor: Number(record.refundedAmountMinor ?? 0),
    refundStatus: (record.refundStatus as Payment['refundStatus']) ?? null,
    currency: String(record.currency ?? 'PKR'),
    commissionPercent: Number(record.commissionPercent ?? 0),
    commissionMinor: Number(record.commissionMinor ?? 0),
    sellerPayableMinor: Number(record.sellerPayableMinor ?? 0),
    failureReason: (record.failureReason as string | null) ?? null,
    idempotencyKey: (record.idempotencyKey as string | null) ?? null,
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0),
    completedAt: (record.completedAt as number | null) ?? null,
    lastStatusAt: Number(record.lastStatusAt ?? 0)
  };
}

export async function createPayment(payment: Payment): Promise<void> {
  const summary = {
    id: payment.id,
    orderId: payment.orderId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    status: payment.status,
    gateway: payment.gateway,
    createdAt: payment.createdAt
  };

  await db()
    .ref()
    .update({
      [paymentPath(payment.id)]: payment,
      [`${PATHS.paymentsByUser}/${payment.userId}/${payment.id}`]: summary,
      [`${PATHS.paymentsByOrder}/${payment.orderId}/${payment.id}`]: summary
    });
}

export async function getPayment(id: string): Promise<Payment | null> {
  const snapshot = await db().ref(paymentPath(id)).get();
  return toPayment(snapshot.val(), id);
}

export async function requirePayment(id: string): Promise<Payment> {
  const payment = await getPayment(id);
  if (!payment) throw notFound('Payment not found');
  return payment;
}

export async function listPaymentsByUser(userId: string, limit = 50): Promise<Payment[]> {
  const snapshot = await db().ref(`${PATHS.paymentsByUser}/${userId}`).limitToLast(limit).get();
  const value = snapshot.val() as Record<string, { id?: string }> | null;
  if (!value) return [];

  const ids = Object.keys(value);
  const payments = await Promise.all(ids.map((id) => getPayment(id)));
  return payments
    .filter((payment): payment is Payment => payment !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listPaymentsByOrder(orderId: string): Promise<Payment[]> {
  const snapshot = await db().ref(`${PATHS.paymentsByOrder}/${orderId}`).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  const ids = Object.keys(value);
  const payments = await Promise.all(ids.map((id) => getPayment(id)));
  return payments
    .filter((payment): payment is Payment => payment !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Newest N payments by createdAt. Requires .indexOn: createdAt. */
export async function listRecentPayments(limit = 200): Promise<Payment[]> {
  const snapshot = await db()
    .ref(PATHS.payments)
    .orderByChild('createdAt')
    .limitToLast(limit)
    .get();

  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toPayment(record, id))
    .filter((payment): payment is Payment => payment !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Compare-and-swap status transition. Returns applied=false when another
 * process already moved the payment, which makes webhook replays harmless.
 */
export async function transitionPayment(input: {
  paymentId: string;
  to: PaymentStatus;
  source: TransitionSource;
  patch?: Partial<Payment>;
}): Promise<{ applied: boolean; payment: Payment }> {
  const current = await requirePayment(input.paymentId);

  if (current.status === input.to) {
    return { applied: false, payment: current };
  }

  assertTransition(current.status, input.to, input.source);

  const now = Date.now();
  const next: Payment = {
    ...current,
    ...input.patch,
    status: input.to,
    updatedAt: now,
    lastStatusAt: now,
    completedAt:
      input.to === 'PAID' ? current.completedAt ?? now : current.completedAt ?? null
  };

  const result = await db()
    .ref(paymentPath(input.paymentId))
    .transaction((node) => {
      const existing = node as Payment | null;
      if (!existing) return undefined;
      // Only apply if nobody changed the status since we read it.
      if (existing.status !== current.status) return undefined;
      return next;
    });

  if (!result.committed) {
    const latest = await requirePayment(input.paymentId);
    return { applied: latest.status === input.to, payment: latest };
  }

  return { applied: true, payment: next };
}

export async function appendPaymentEvent(input: {
  paymentId: string;
  type: PaymentEventType;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  actor: string;
  source: PaymentEvent['source'];
  message?: string | null;
}): Promise<PaymentEvent> {
  const event: PaymentEvent = {
    id: newId('evt'),
    paymentId: input.paymentId,
    type: input.type,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actor: input.actor,
    source: input.source,
    message: input.message ?? null,
    createdAt: Date.now()
  };

  await db().ref(eventPath(input.paymentId, event.id)).set(event);
  return event;
}

export async function listPaymentEvents(paymentId: string): Promise<PaymentEvent[]> {
  const snapshot = await db().ref(`${PATHS.paymentEvents}/${paymentId}`).get();
  const value = snapshot.val() as Record<string, PaymentEvent> | null;
  if (!value) return [];
  return Object.values(value).sort((a, b) => a.createdAt - b.createdAt);
}

/** Maps a gateway tracker to our payment id. Doubles as a uniqueness index. */
export async function registerTracker(tracker: string, paymentId: string): Promise<void> {
  const result = await db().ref(trackerPath(tracker)).transaction((node) => {
    if (node !== null) return undefined; // already claimed - never overwrite
    return { paymentId, createdAt: Date.now() };
  });

  if (!result.committed) {
    throw new AppError('CONFLICT', 'This gateway transaction is already linked to another payment');
  }
}

export async function findPaymentIdByTracker(tracker: string): Promise<string | null> {
  const snapshot = await db().ref(trackerPath(tracker)).get();
  const value = snapshot.val() as { paymentId?: string } | null;
  return value?.paymentId ?? null;
}

/**
 * Idempotency claims: first caller wins, later callers receive the existing
 * payment id so retries never create a second charge.
 */
export async function claimIdempotencyKey(
  key: string,
  paymentId: string
): Promise<{ claimed: boolean; existingPaymentId: string | null }> {
  const result = await db().ref(idempotencyPath(key)).transaction((node) => {
    if (node !== null) return undefined;
    return { paymentId, createdAt: Date.now() };
  });

  if (result.committed) return { claimed: true, existingPaymentId: null };

  const snapshot = await db().ref(idempotencyPath(key)).get();
  const value = snapshot.val() as { paymentId?: string } | null;
  return { claimed: false, existingPaymentId: value?.paymentId ?? null };
}

/** Replay protection: returns true only for the first delivery of an event id. */
export async function firstWebhookDelivery(
  provider: string,
  eventId: string,
  payloadHash: string
): Promise<boolean> {
  const result = await db()
    .ref(webhookEventPath(provider, eventId))
    .transaction((node) => {
      if (node !== null) return undefined;
      return { receivedAt: Date.now(), payloadHash };
    });

  return result.committed;
}

/** Releases a claim so a failed processing attempt can be retried by the gateway. */
export async function releaseWebhookDelivery(provider: string, eventId: string): Promise<void> {
  await db().ref(webhookEventPath(provider, eventId)).remove();
}

export async function attachTracker(paymentId: string, tracker: string): Promise<Payment> {
  await registerTracker(tracker, paymentId);
  const { payment } = await transitionPayment({
    paymentId,
    to: 'PENDING',
    source: 'api',
    patch: { gatewayTrackerId: tracker }
  });
  return payment;
}

/** True when a payment can still be paid (used by the initiation endpoint). */
export function isOpenForPayment(status: PaymentStatus): boolean {
  return canTransition(status, 'PAID', 'gateway_webhook');
}
