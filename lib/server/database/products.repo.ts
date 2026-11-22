import { db } from '../firebase/admin';
import { PATHS, productPath } from './paths';
import type { Product, ProductFile, ReviewRecord } from '../../shared/types';
import type { LicenseType, ProductKind, ProductStatus } from '../../shared/enums';
import { notFound } from '../utils/errors';
import { newId } from '../utils/ids';
import { slugify } from './categories.repo';

function toProduct(value: unknown, id: string): Product | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  return {
    id,
    sellerId: String(record.sellerId ?? ''),
    sellerName: String(record.sellerName ?? ''),
    title: String(record.title ?? ''),
    slug: String(record.slug ?? id),
    summary: String(record.summary ?? ''),
    description: String(record.description ?? ''),
    categoryId: String(record.categoryId ?? ''),
    kind: (record.kind as ProductKind) ?? 'OTHER',
    license: (record.license as LicenseType) ?? 'STANDARD',
    tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
    priceMinor: Number(record.priceMinor ?? 0),
    currency: String(record.currency ?? 'PKR'),
    status: (record.status as ProductStatus) ?? 'DRAFT',
    files: Array.isArray(record.files) ? (record.files as ProductFile[]) : [],
    previewUrl: (record.previewUrl as string | null) ?? null,
    demoUrl: (record.demoUrl as string | null) ?? null,
    documentationUrl: (record.documentationUrl as string | null) ?? null,
    review: (record.review as ReviewRecord | null) ?? null,
    rejectionNote: (record.rejectionNote as string | null) ?? null,
    salesCount: Number(record.salesCount ?? 0),
    rating: Number(record.rating ?? 0),
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0),
    approvedAt: (record.approvedAt as number | null) ?? null
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

export async function requireApprovedProduct(id: string): Promise<Product> {
  const product = await requireProduct(id);
  if (product.status !== 'APPROVED') throw notFound('Product not found');
  return product;
}

async function claimSlug(base: string, productId: string): Promise<string> {
  const root = slugify(base) || `product-${productId.slice(-6)}`;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const result = await db()
      .ref(`${PATHS.productSlugs}/${candidate}`)
      .transaction((node) => {
        if (node !== null) return undefined;
        return { productId, createdAt: Date.now() };
      });

    if (result.committed) return candidate;
  }

  return `${root}-${productId.slice(-6)}`;
}

export interface DraftInput {
  sellerId: string;
  sellerName: string;
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  kind: ProductKind;
  license: LicenseType;
  tags: string[];
  priceMinor: number;
  previewUrl?: string | null;
  demoUrl?: string | null;
  documentationUrl?: string | null;
}

export async function createDraft(input: DraftInput): Promise<Product> {
  const id = newId('prod');
  const slug = await claimSlug(input.title, id);
  const now = Date.now();

  const product: Product = {
    id,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    title: input.title,
    slug,
    summary: input.summary,
    description: input.description,
    categoryId: input.categoryId,
    kind: input.kind,
    license: input.license,
    tags: input.tags,
    priceMinor: input.priceMinor,
    currency: 'PKR',
    status: 'DRAFT',
    files: [],
    previewUrl: input.previewUrl ?? null,
    demoUrl: input.demoUrl ?? null,
    documentationUrl: input.documentationUrl ?? null,
    review: null,
    rejectionNote: null,
    salesCount: 0,
    rating: 0,
    createdAt: now,
    updatedAt: now,
    approvedAt: null
  };

  await db().ref(productPath(id)).set(product);
  return product;
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, 'id' | 'sellerId' | 'slug' | 'createdAt'>>
): Promise<Product> {
  const current = await requireProduct(id);
  const next: Product = { ...current, ...patch, updatedAt: Date.now() };
  await db().ref(productPath(id)).set(next);
  return next;
}

export async function attachFile(id: string, file: ProductFile): Promise<Product> {
  const current = await requireProduct(id);
  const files = [...current.files.filter((existing) => existing.id !== file.id), file];
  return updateProduct(id, { files });
}

export async function setProductStatus(
  id: string,
  status: ProductStatus,
  patch: Partial<Pick<Product, 'review' | 'rejectionNote' | 'approvedAt'>> = {}
): Promise<Product> {
  return updateProduct(id, { status, ...patch });
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
    .filter((product): product is Product => product !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listProductsByStatus(status: ProductStatus, limit = 100): Promise<Product[]> {
  const snapshot = await db()
    .ref(PATHS.products)
    .orderByChild('status')
    .equalTo(status)
    .limitToFirst(limit)
    .get();

  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  return Object.entries(value)
    .map(([id, record]) => toProduct(record, id))
    .filter((product): product is Product => product !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listApprovedProducts(
  limit = 48,
  options: { categoryId?: string; kind?: ProductKind; search?: string } = {}
): Promise<Product[]> {
  const query = options.categoryId
    ? db().ref(PATHS.products).orderByChild('categoryId').equalTo(options.categoryId).limitToFirst(200)
    : db().ref(PATHS.products).orderByChild('status').equalTo('APPROVED').limitToFirst(200);

  const snapshot = await query.get();
  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  const search = options.search?.toLowerCase().trim();

  return Object.entries(value)
    .map(([id, record]) => toProduct(record, id))
    .filter((product): product is Product => product !== null && product.status === 'APPROVED')
    .filter((product) => (options.kind ? product.kind === options.kind : true))
    .filter((product) =>
      search
        ? [product.title, product.summary, ...product.tags].join(' ').toLowerCase().includes(search)
        : true
    )
    .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
    .slice(0, limit);
}

/** Products waiting for a human decision, oldest first. */
export async function listReviewQueue(limit = 100): Promise<Product[]> {
  return listProductsByStatus('PENDING_REVIEW', limit);
}
