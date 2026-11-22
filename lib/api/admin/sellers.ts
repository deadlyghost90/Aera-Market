import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { requireAdmin } from '../../server/firebase/guards';
import { listSellersByStatus, setSellerStatus } from '../../server/database/sellers.repo';
import { updateUser } from '../../server/database/users.repo';
import { writeAudit } from '../../server/security/audit';
import { parse, idSchema } from '../../server/security/validate';
import { SELLER_STATUS } from '../../shared/enums';

const patchSchema = z.object({
  uid: idSchema,
  status: z.enum(SELLER_STATUS),
  reason: z.string().trim().max(500).optional(),
  commissionPercent: z.number().int().min(0).max(100).optional()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method === 'GET') {
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
    const status = (SELLER_STATUS as readonly string[]).includes(statusRaw)
      ? (statusRaw as (typeof SELLER_STATUS)[number])
      : 'PENDING';

    sendJson(res, 200, { data: await listSellersByStatus(status, 100) });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const body = parse(patchSchema, req.body);

  const seller = await setSellerStatus(body.uid, body.status, {
    reason: body.reason ?? null,
    commissionPercent: body.commissionPercent
  });

  // Suspending an author must also remove their products from the catalogue.
  if (body.status === 'SUSPENDED') {
    const { listSellerProducts, setProductStatus } = await import(
      '../../server/database/products.repo'
    );
    const products = await listSellerProducts(body.uid, 200);
    for (const product of products) {
      if (product.status === 'APPROVED') {
        await setProductStatus(product.id, 'SUSPENDED', {
          rejectionNote: 'Author account suspended by an administrator.'
        });
      }
    }
  }

  // Approval unlocks the SELLER role used by the rest of the platform.
  if (body.status === 'APPROVED') {
    await updateUser(body.uid, { role: 'SELLER' });
  }

  await writeAudit({
    actorUid: auth.uid,
    action: `seller.${body.status.toLowerCase()}`,
    targetType: 'seller',
    targetId: body.uid,
    meta: { reason: body.reason ?? null }
  });

  sendJson(res, 200, { data: seller });
});
