import { db } from '../firebase/admin';
import { PATHS, balancePath, ledgerPath } from './paths';
import type { LedgerEntry, SellerBalance } from '../../shared/types';
import { newId } from '../utils/ids';

export async function appendLedgerEntries(entries: Omit<LedgerEntry, 'id'>[]): Promise<LedgerEntry[]> {
  const created: LedgerEntry[] = entries.map((entry) => ({ ...entry, id: newId('led') }));

  const updates: Record<string, unknown> = {};
  for (const entry of created) {
    updates[ledgerPath(entry.id)] = entry;
  }

  if (Object.keys(updates).length > 0) {
    await db().ref().update(updates);
  }

  return created;
}

export async function listLedgerByPayment(paymentId: string): Promise<LedgerEntry[]> {
  const snapshot = await db().ref(PATHS.ledger).orderByChild('paymentId').equalTo(paymentId).get();
  const value = snapshot.val() as Record<string, LedgerEntry> | null;
  if (!value) return [];
  return Object.values(value).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Seller balance is a materialised view of the ledger. Each payment is applied
 * at most once thanks to the `applied` guard written inside the same
 * transaction, so retries and duplicate webhooks cannot double-credit.
 */
export async function applySellerDelta(input: {
  sellerId: string;
  appliedKey: string;
  availableDelta: number;
  lifetimeDelta: number;
  currency?: string;
}): Promise<SellerBalance> {
  const ref = db().ref(balancePath(input.sellerId));

  const result = await ref.transaction((node) => {
    const current = (node as (SellerBalance & { applied?: Record<string, number> }) | null) ?? {
      sellerId: input.sellerId,
      availableMinor: 0,
      pendingMinor: 0,
      lifetimeMinor: 0,
      currency: input.currency ?? 'PKR',
      updatedAt: Date.now()
    };

    const applied = current.applied ?? {};
    if (applied[input.appliedKey] !== undefined) return undefined; // already applied

    return {
      ...current,
      availableMinor: current.availableMinor + input.availableDelta,
      lifetimeMinor: current.lifetimeMinor + input.lifetimeDelta,
      updatedAt: Date.now(),
      applied: { ...applied, [input.appliedKey]: Date.now() }
    };
  });

  if (!result.committed) {
    const snapshot = await ref.get();
    return snapshot.val() as SellerBalance;
  }

  return result.snapshot.val() as SellerBalance;
}

export async function getSellerBalance(sellerId: string): Promise<SellerBalance | null> {
  const snapshot = await db().ref(balancePath(sellerId)).get();
  const value = snapshot.val() as SellerBalance | null;
  if (!value) return null;
  return {
    sellerId: value.sellerId ?? sellerId,
    availableMinor: value.availableMinor ?? 0,
    pendingMinor: value.pendingMinor ?? 0,
    lifetimeMinor: value.lifetimeMinor ?? 0,
    currency: value.currency ?? 'PKR',
    updatedAt: value.updatedAt ?? 0
  };
}

export async function listSellerBalances(limit = 200): Promise<SellerBalance[]> {
  const snapshot = await db().ref(PATHS.sellerBalances).limitToFirst(limit).get();
  const value = snapshot.val() as Record<string, SellerBalance> | null;
  if (!value) return [];
  return Object.entries(value).map(([sellerId, balance]) => ({
    sellerId,
    availableMinor: balance.availableMinor ?? 0,
    pendingMinor: balance.pendingMinor ?? 0,
    lifetimeMinor: balance.lifetimeMinor ?? 0,
    currency: balance.currency ?? 'PKR',
    updatedAt: balance.updatedAt ?? 0
  }));
}
