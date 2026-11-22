import { db } from '../firebase/admin';
import { PATHS, productPath } from './paths';
import type { Product } from '../../shared/types';
import { notFound } from '../utils/errors';

function toProduct(value: unknown, id: string): Product | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id,
    sellerId: String(record.sellerId ?? ''),
    title: String(record.title ?? ''),
    slug: String(record.slug ?? id),
    description: String(record.description ?? ''),
    priceMinor: Number(record.priceMinor ?? 0),
    currency: String(record.currency ?? 'PKR'),
    status: (record.status as Product['status']) ?? 'DRAFT',
    categoryId: (record.categoryId as string | null) ?? null,
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0)
  };
}

export async function getProduct(id: string): Promise<Product | null> {
  const snapshot = await db().ref(productPath(id)).get();
  return toProduct(snapshot.val(), id);
}

export async function requireProduct(id: string): Promise<Product> {
  const product = await getProduct(id);
  if (!product) throw notFound('Product not found');
  return product;
}

export async function createProduct(input: {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  priceMinor: number;
  categoryId?: string | null;
}): Promise<Product> {
  const now = Date.now();
  const product: Product = {
    id: input.id,
    sellerId: input.sellerId,
    title: input.title,
    slug: input.id,
    description: input.description,
    priceMinor: input.priceMinor,
    currency: 'PKR',
    status: 'ACTIVE',
    categoryId: input.categoryId ?? null,
    createdAt: now,
    updatedAt: now
  };

  await db().ref(productPath(input.id)).set(product);
  return product;
}

/** Public catalogue: only ACTIVE products (requires .indexOn: status). */
export async function listActiveProducts(limit = 50): Promise<Product[]> {
  const snapshot = await db()
    .ref(PATHS.products)
    .orderByChild('status')
    .equalTo('ACTIVE')
    .limitToFirst(limit)
    .get();

  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toProduct(record, id))
    .filter((record): record is Product => record !== null && record.status === 'ACTIVE')
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listSellerProducts(sellerId: string, limit = 100): Promise<Product[]> {
  const snapshot = await db()
    .ref(PATHS.products)
    .orderByChild('sellerId')
    .equalTo(sellerId)
    .limitToFirst(limit)
    .get();

  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toProduct(record, id))
    .filter((record): record is Product => record !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}
