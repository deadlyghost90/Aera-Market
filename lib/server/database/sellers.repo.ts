import { db } from '../firebase/admin';
import { PATHS, sellerPath } from './paths';
import type { Seller } from '../../shared/types';
import type { SellerStatus } from '../../shared/enums';
import { notFound } from '../utils/errors';

function toSeller(value: unknown, uid: string): Seller | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const stats = (record.stats ?? {}) as Record<string, unknown>;
  return {
    uid,
    displayName: String(record.displayName ?? ''),
    bio: String(record.bio ?? ''),
    country: String(record.country ?? 'PK'),
    status: (record.status as SellerStatus) ?? 'PENDING',
    commissionPercent: Number(record.commissionPercent ?? 40),
    payoutMethod: (record.payoutMethod as string | null) ?? null,
    rejectionReason: (record.rejectionReason as string | null) ?? null,
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0),
    approvedAt: (record.approvedAt as number | null) ?? null,
    stats: {
      products: Number(stats.products ?? 0),
      sales: Number(stats.sales ?? 0),
      grossMinor: Number(stats.grossMinor ?? 0)
    }
  };
}

export async function getSeller(uid: string): Promise<Seller | null> {
  const snapshot = await db().ref(sellerPath(uid)).get();
  return toSeller(snapshot.val(), uid);
}

export async function requireSellerRecord(uid: string): Promise<Seller> {
  const seller = await getSeller(uid);
  if (!seller) throw notFound('Seller profile not found');
  return seller;
}

/** Any signed-in user may apply; admins decide whether they can publish. */
export async function applyAsSeller(input: {
  uid: string;
  displayName: string;
  bio: string;
  country: string;
  commissionPercent: number;
}): Promise<Seller> {
  const now = Date.now();
  const existing = await getSeller(input.uid);

  const seller: Seller = {
    uid: input.uid,
    displayName: input.displayName,
    bio: input.bio,
    country: input.country,
    status: existing?.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
    commissionPercent: existing?.commissionPercent ?? input.commissionPercent,
    payoutMethod: existing?.payoutMethod ?? null,
    rejectionReason: existing?.status === 'REJECTED' ? null : existing?.rejectionReason ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    approvedAt: existing?.approvedAt ?? null,
    stats: existing?.stats ?? { products: 0, sales: 0, grossMinor: 0 }
  };

  await db().ref(sellerPath(input.uid)).set(seller);
  await db()
    .ref(`${PATHS.sellerSlugs}/${input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
    .set(input.uid);

  return seller;
}

export async function updateSeller(
  uid: string,
  patch: Partial<Pick<Seller, 'displayName' | 'bio' | 'country' | 'payoutMethod'>>
): Promise<Seller> {
  const current = await requireSellerRecord(uid);
  const next: Seller = { ...current, ...patch, updatedAt: Date.now() };
  await db().ref(sellerPath(uid)).set(next);
  return next;
}

export async function setSellerStatus(
  uid: string,
  status: SellerStatus,
  options: { reason?: string | null; commissionPercent?: number } = {}
): Promise<Seller> {
  const current = await requireSellerRecord(uid);
  const next: Seller = {
    ...current,
    status,
    rejectionReason: options.reason ?? null,
    commissionPercent: options.commissionPercent ?? current.commissionPercent,
    approvedAt: status === 'APPROVED' ? Date.now() : current.approvedAt,
    updatedAt: Date.now()
  };
  await db().ref(sellerPath(uid)).set(next);
  return next;
}

export async function listSellersByStatus(
  status: SellerStatus | 'ALL',
  limit = 100
): Promise<Seller[]> {
  const snapshot = await db().ref(PATHS.sellers).limitToFirst(limit).get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([uid, record]) => toSeller(record, uid))
    .filter((seller): seller is Seller => seller !== null)
    .filter((seller) => status === 'ALL' || seller.status === status)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function bumpSellerStats(
  uid: string,
  delta: { products?: number; sales?: number; grossMinor?: number }
): Promise<void> {
  const current = await getSeller(uid);
  if (!current) return;

  await db()
    .ref(`${sellerPath(uid)}/stats`)
    .update({
      products: Math.max(0, current.stats.products + (delta.products ?? 0)),
      sales: Math.max(0, current.stats.sales + (delta.sales ?? 0)),
      grossMinor: Math.max(0, current.stats.grossMinor + (delta.grossMinor ?? 0))
    });
}
