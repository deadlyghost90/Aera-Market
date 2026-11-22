import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireSeller } from '../../lib/server/firebase/guards';
import { createProduct, listActiveProducts, listSellerProducts } from '../../lib/server/database/products.repo';
import { parse, idSchema, moneyMinorSchema } from '../../lib/server/security/validate';
import { newId } from '../../lib/server/utils/ids';
import { writeAudit } from '../../lib/server/security/audit';
import { AppError } from '../../lib/server/utils/errors';

const createSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  priceMinor: moneyMinorSchema.refine((value) => value >= 100, 'Price must be at least PKR 1.00'),
  categoryId: idSchema.nullish()
});

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  if (req.method === 'GET') {
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(60, Math.max(1, Number(limitRaw ?? 24) || 24));

    const mine = req.query.mine === '1';
    if (mine) {
      const auth = await requireSeller(req);
      const products = await listSellerProducts(auth.uid);
      sendJson(res, 200, { data: products });
      return;
    }

    const products = await listActiveProducts(limit);
    sendJson(res, 200, { data: products }, 'public, s-maxage=60, stale-while-revalidate=300');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  assertSameOrigin(req, config.APP_ORIGIN);
  const auth = await requireSeller(req);
  const body = parse(createSchema, req.body);

  if (auth.user.role === 'BUYER') {
    throw new AppError('FORBIDDEN', 'Only sellers can publish products');
  }

  const product = await createProduct({
    id: newId('prod'),
    sellerId: auth.uid,
    title: body.title,
    description: body.description,
    priceMinor: body.priceMinor,
    categoryId: body.categoryId ?? null
  });

  await writeAudit({
    actorUid: auth.uid,
    action: 'product.created',
    targetType: 'product',
    targetId: product.id,
    meta: { priceMinor: product.priceMinor },
    ipHash: ctx.ip
  });

  sendJson(res, 201, { data: product });
});
