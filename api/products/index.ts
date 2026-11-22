import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireApprovedSeller } from '../../lib/server/firebase/guards';
import { listApprovedProducts, createDraft } from '../../lib/server/database/products.repo';
import { requireCategory } from '../../lib/server/database/categories.repo';
import { requireSellerRecord } from '../../lib/server/database/sellers.repo';
import { parse, idSchema, moneyMinorSchema } from '../../lib/server/security/validate';
import { writeAudit } from '../../lib/server/security/audit';
import { AppError } from '../../lib/server/utils/errors';
import { LICENSE_TYPE, PRODUCT_KIND } from '../../lib/shared/enums';

const draftSchema = z.object({
  title: z.string().trim().min(8).max(120),
  summary: z.string().trim().min(40).max(200),
  description: z.string().trim().min(50).max(8000),
  categoryId: idSchema,
  kind: z.enum(PRODUCT_KIND),
  license: z.enum(LICENSE_TYPE).default('STANDARD'),
  priceMinor: moneyMinorSchema,
  tags: z.array(z.string().trim().min(2).max(24)).max(10).default([]),
  previewUrl: z.string().trim().max(400).nullish(),
  demoUrl: z.string().trim().url().max(400).nullish(),
  documentationUrl: z.string().trim().url().max(400).nullish()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') {
    const limited = Math.min(60, Math.max(1, Number(req.query.limit ?? 24) || 24));
    const categoryId = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.q === 'string' ? req.query.q : undefined;
    const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const kind = kindRaw && (PRODUCT_KIND as readonly string[]).includes(kindRaw)
      ? (kindRaw as (typeof PRODUCT_KIND)[number])
      : undefined;

    const products = await listApprovedProducts(limited, { categoryId, search, kind });

    sendJson(
      res,
      200,
      {
        data: products.map((product) => ({
          id: product.id,
          title: product.title,
          summary: product.summary,
          slug: product.slug,
          kind: product.kind,
          license: product.license,
          priceMinor: product.priceMinor,
          currency: product.currency,
          tags: product.tags,
          rating: product.rating,
          salesCount: product.salesCount,
          sellerId: product.sellerId,
          sellerName: product.sellerName,
          categoryId: product.categoryId,
          previewUrl: product.previewUrl ? `/api/previews/${product.id}` : null,
          approvedAt: product.approvedAt
        }))
      },
      'public, s-maxage=60, stale-while-revalidate=300'
    );
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  assertSameOrigin(req, config.APP_ORIGIN);

  const auth = await requireApprovedSeller(req);
  const seller = await requireSellerRecord(auth.uid);
  const body = parse(draftSchema, req.body);

  const category = await requireCategory(body.categoryId);
  if (!category.active) throw new AppError('BAD_REQUEST', 'That category is not open');
  if (!category.allowedKinds.includes(body.kind)) {
    throw new AppError('BAD_REQUEST', `${category.name} does not accept ${body.kind} products`);
  }
  if (body.priceMinor < category.minPriceMinor) {
    throw new AppError(
      'BAD_REQUEST',
      `Minimum price in ${category.name} is ${(category.minPriceMinor / 100).toFixed(2)} PKR`
    );
  }

  const product = await createDraft({
    sellerId: auth.uid,
    sellerName: seller.displayName,
    title: body.title,
    summary: body.summary,
    description: body.description,
    categoryId: body.categoryId,
    kind: body.kind,
    license: body.license ?? 'STANDARD',
    tags: body.tags ?? [],
    priceMinor: body.priceMinor,
    previewUrl: body.previewUrl ?? null,
    demoUrl: body.demoUrl ?? null,
    documentationUrl: body.documentationUrl ?? null
  });

  await writeAudit({
    actorUid: auth.uid,
    action: 'product.draft_created',
    targetType: 'product',
    targetId: product.id,
    meta: { categoryId: body.categoryId, kind: body.kind, priceMinor: body.priceMinor }
  });

  sendJson(res, 201, { data: product });
});
