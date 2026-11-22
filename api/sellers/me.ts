import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireUser } from '../../lib/server/firebase/guards';
import { getSeller, requireSellerRecord, updateSeller } from '../../lib/server/database/sellers.repo';
import { listSellerProducts } from '../../lib/server/database/products.repo';
import { parse } from '../../lib/server/security/validate';

const patchSchema = z.object({
  displayName: z.string().trim().min(3).max(60).optional(),
  bio: z.string().trim().min(40).max(1200).optional(),
  country: z.string().trim().length(2).optional(),
  payoutMethod: z.string().trim().max(200).optional()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);
  const seller = await getSeller(auth.uid);

  if (!seller) {
    sendJson(res, 200, { data: null });
    return;
  }

  if (req.method === 'GET') {
    const products = await listSellerProducts(auth.uid);
    const counts = products.reduce(
      (acc, product) => {
        acc[product.status] = (acc[product.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    sendJson(res, 200, {
      data: {
        seller,
        counts,
        products: products.map((product) => ({
          id: product.id,
          title: product.title,
          status: product.status,
          priceMinor: product.priceMinor,
          files: product.files.length,
          updatedAt: product.updatedAt,
          rejectionNote: product.rejectionNote
        }))
      }
    });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  await requireSellerRecord(auth.uid);
  const body = parse(patchSchema, req.body);

  const updated = await updateSeller(auth.uid, {
    ...(body.displayName ? { displayName: body.displayName } : {}),
    ...(body.bio ? { bio: body.bio } : {}),
    ...(body.country ? { country: body.country.toUpperCase() } : {}),
    ...(body.payoutMethod !== undefined ? { payoutMethod: body.payoutMethod } : {})
  });

  sendJson(res, 200, { data: updated });
});
