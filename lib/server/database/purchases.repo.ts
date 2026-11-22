import { db } from '../firebase/admin';
import { PATHS, assertSafeId } from './paths';
import type { OrderItem, Purchase } from '../../shared/types';
import { newId } from '../utils/ids';

const purchasePath = (userId: string, productId: string) =>
  `${PATHS.purchases}/${assertSafeId(userId, 'user id')}/${assertSafeId(productId, 'product id')}`;

function toPurchase(value: unknown, productId: string): Purchase | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id: String(record.id ?? ''),
    userId: String(record.userId ?? ''),
    productId,
    orderId: String(record.orderId ?? ''),
    productName: String(record.productName ?? ''),
    sellerId: String(record.sellerId ?? ''),
    priceMinor: Number(record.priceMinor ?? 0),
    currency: String(record.currency ?? 'PKR'),
    grantedAt: Number(record.grantedAt ?? 0),
    downloadCount: Number(record.downloadCount ?? 0)
  };
}

/**
 * Grants ownership for every item in a paid order. Idempotent: a product the
 * buyer already owns keeps its original grant time and download counter.
 */
export async function grantPurchases(input: {
  userId: string;
  orderId: string;
  items: OrderItem[];
  currency: string;
}): Promise<Purchase[]> {
  const granted: Purchase[] = [];

  for (const item of input.items) {
    const ref = db().ref(purchasePath(input.userId, item.productId));

    const existing = await ref.get();
    const already = toPurchase(existing.val(), item.productId);
    if (already) {
      granted.push(already);
      continue;
    }

    const purchase: Purchase = {
      id: newId('purch'),
      userId: input.userId,
      productId: item.productId,
      orderId: input.orderId,
      productName: item.productName,
      sellerId: item.sellerId,
      priceMinor: item.unitPriceMinor * item.quantity,
      currency: input.currency,
      grantedAt: Date.now(),
      downloadCount: 0
    };

    await ref.set(purchase);
    granted.push(purchase);
  }

  return granted;
}

export async function getPurchase(userId: string, productId: string): Promise<Purchase | null> {
  const snapshot = await db().ref(purchasePath(userId, productId)).get();
  return toPurchase(snapshot.val(), productId);
}

export async function listPurchases(userId: string): Promise<Purchase[]> {
  const snapshot = await db().ref(`${PATHS.purchases}/${assertSafeId(userId, 'user id')}`).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([productId, record]) => toPurchase(record, productId))
    .filter((purchase): purchase is Purchase => purchase !== null)
    .sort((a, b) => b.grantedAt - a.grantedAt);
}

/** Counts authorised downloads without ever letting the client claim one. */
export async function incrementDownloadCount(userId: string, productId: string): Promise<void> {
  await db()
    .ref(`${purchasePath(userId, productId)}/downloadCount`)
    .transaction((current) => Number(current ?? 0) + 1);
}

/** Called when a payment is fully refunded: ownership ends with the money. */
export async function revokePurchase(userId: string, productId: string): Promise<void> {
  await db().ref(purchasePath(userId, productId)).remove();
}
