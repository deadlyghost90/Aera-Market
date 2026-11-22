import { db } from '../firebase/admin';
import { PATHS, eventPath, ledgerPath, orderPath } from './paths';
import type { LedgerEntry, PaymentEvent } from '../../shared/types';
import type { OrderStatus, PaymentStatus } from '../../shared/enums';
import { newId } from '../utils/ids';

export interface SettlementInput {
  paymentId: string;
  orderId: string;
  buyerId: string;
  orderStatus: OrderStatus;
  entries: Omit<LedgerEntry, 'id'>[];
  event: {
    type: PaymentEvent['type'];
    fromStatus: PaymentStatus | null;
    toStatus: PaymentStatus;
    actor: string;
    source: PaymentEvent['source'];
    message?: string | null;
  };
}

/**
 * Writes ledger entries, the payment event, and the order status in a single
 * atomic multi-path update. Partial settlement is therefore impossible.
 */
export async function writeSettlement(input: SettlementInput): Promise<LedgerEntry[]> {
  const now = Date.now();
  const updates: Record<string, unknown> = {};

  const created: LedgerEntry[] = input.entries.map((entry) => ({ ...entry, id: newId('led') }));
  for (const entry of created) {
    updates[ledgerPath(entry.id)] = entry;
  }

  const eventId = newId('evt');
  updates[eventPath(input.paymentId, eventId)] = {
    id: eventId,
    paymentId: input.paymentId,
    type: input.event.type,
    fromStatus: input.event.fromStatus,
    toStatus: input.event.toStatus,
    actor: input.event.actor,
    source: input.event.source,
    message: input.event.message ?? null,
    createdAt: now
  } satisfies PaymentEvent;

  // Leaf writes only - never replace a whole order node.
  updates[`${orderPath(input.orderId)}/status`] = input.orderStatus;
  updates[`${orderPath(input.orderId)}/updatedAt`] = now;
  updates[`${PATHS.ordersByBuyer}/${input.buyerId}/${input.orderId}/status`] = input.orderStatus;

  await db().ref().update(updates);
  return created;
}

/** Appends an event without touching balances (failure paths, admin notes). */
export async function writePaymentEventOnly(input: {
  paymentId: string;
  type: PaymentEvent['type'];
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  actor: string;
  source: PaymentEvent['source'];
  message?: string | null;
}): Promise<void> {
  const eventId = newId('evt');
  await db()
    .ref(eventPath(input.paymentId, eventId))
    .set({
      id: eventId,
      paymentId: input.paymentId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: input.actor,
      source: input.source,
      message: input.message ?? null,
      createdAt: Date.now()
    } satisfies PaymentEvent);
}
