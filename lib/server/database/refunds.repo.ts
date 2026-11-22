import { db } from '../firebase/admin';
import { PATHS, refundPath } from './paths';
import type { Refund } from '../../shared/types';
import type { RefundStatus } from '../../shared/enums';
import { notFound } from '../utils/errors';
import { newId } from '../utils/ids';

function toRefund(value: unknown, id: string): Refund | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id,
    paymentId: String(record.paymentId ?? ''),
    orderId: String(record.orderId ?? ''),
    userId: String(record.userId ?? ''),
    amountMinor: Number(record.amountMinor ?? 0),
    currency: String(record.currency ?? 'PKR'),
    reason: String(record.reason ?? ''),
    status: (record.status as RefundStatus) ?? 'REQUESTED',
    requestedBy: String(record.requestedBy ?? ''),
    decidedBy: (record.decidedBy as string | null) ?? null,
    decisionNote: (record.decisionNote as string | null) ?? null,
    gatewayRefundId: (record.gatewayRefundId as string | null) ?? null,
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0),
    completedAt: (record.completedAt as number | null) ?? null
  };
}

export async function createRefundInput(input: {
  paymentId: string;
  orderId: string;
  userId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  requestedBy: string;
}): Promise<Refund> {
  const now = Date.now();
  const refund: Refund = {
    id: newId('rfnd'),
    paymentId: input.paymentId,
    orderId: input.orderId,
    userId: input.userId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    reason: input.reason,
    status: 'REQUESTED',
    requestedBy: input.requestedBy,
    decidedBy: null,
    decisionNote: null,
    gatewayRefundId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  await db()
    .ref()
    .update({
      [refundPath(refund.id)]: refund,
      [`${PATHS.refundsByUser}/${refund.userId}/${refund.id}`]: {
        id: refund.id,
        paymentId: refund.paymentId,
        amountMinor: refund.amountMinor,
        status: refund.status,
        createdAt: refund.createdAt
      }
    });

  return refund;
}

export async function getRefund(id: string): Promise<Refund | null> {
  const snapshot = await db().ref(refundPath(id)).get();
  return toRefund(snapshot.val(), id);
}

export async function requireRefund(id: string): Promise<Refund> {
  const refund = await getRefund(id);
  if (!refund) throw notFound('Refund request not found');
  return refund;
}

export async function listRefundsByPayment(paymentId: string): Promise<Refund[]> {
  const snapshot = await db().ref(PATHS.refunds).orderByChild('paymentId').equalTo(paymentId).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];
  return Object.entries(value)
    .map(([id, record]) => toRefund(record, id))
    .filter((refund): refund is Refund => refund !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listRefundsByUser(userId: string, limit = 50): Promise<Refund[]> {
  const snapshot = await db().ref(`${PATHS.refundsByUser}/${userId}`).limitToLast(limit).get();
  const value = snapshot.val() as Record<string, { id?: string }> | null;
  if (!value) return [];

  const refunds = await Promise.all(Object.keys(value).map((id) => getRefund(id)));
  return refunds
    .filter((refund): refund is Refund => refund !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listRecentRefunds(limit = 100): Promise<Refund[]> {
  const snapshot = await db().ref(PATHS.refunds).orderByChild('createdAt').limitToLast(limit).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toRefund(record, id))
    .filter((refund): refund is Refund => refund !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateRefund(
  id: string,
  patch: Partial<Pick<Refund, 'status' | 'decidedBy' | 'decisionNote' | 'gatewayRefundId' | 'completedAt'>>
): Promise<Refund> {
  const current = await requireRefund(id);
  const next: Refund = { ...current, ...patch, updatedAt: Date.now() };
  await db().ref(refundPath(id)).set(next);
  return next;
}

/** Only one open refund per payment at a time - prevents double refund abuse. */
export async function findOpenRefund(paymentId: string): Promise<Refund | null> {
  const refunds = await listRefundsByPayment(paymentId);
  return (
    refunds.find((refund) => refund.status === 'REQUESTED' || refund.status === 'APPROVED') ?? null
  );
}
