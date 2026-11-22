import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { requireUser } from '../../server/firebase/guards';
import { applyAsSeller, getSeller } from '../../server/database/sellers.repo';
import { parse } from '../../server/security/validate';
import { writeAudit } from '../../server/security/audit';

const schema = z.object({
  displayName: z.string().trim().min(3).max(60),
  bio: z.string().trim().min(40).max(1200),
  country: z.string().trim().length(2).default('PK')
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);

  if (req.method === 'GET') {
    sendJson(res, 200, { data: await getSeller(auth.uid) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  assertSameOrigin(req, config.APP_ORIGIN);

  const body = parse(schema, req.body);
  const seller = await applyAsSeller({
    uid: auth.uid,
    displayName: body.displayName,
    bio: body.bio,
    country: (body.country ?? 'PK').toUpperCase(),
    commissionPercent: config.PLATFORM_COMMISSION_PERCENT
  });

  await writeAudit({
    actorUid: auth.uid,
    action: 'seller.applied',
    targetType: 'seller',
    targetId: auth.uid,
    meta: { displayName: seller.displayName }
  });

  sendJson(res, existingStatus(seller.status), { data: seller });
});

function existingStatus(status: string): number {
  return status === 'PENDING' ? 201 : 200;
}
