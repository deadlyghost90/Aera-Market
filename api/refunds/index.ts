import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireUser } from '../../lib/server/firebase/guards';
import { listRefundsByUser } from '../../lib/server/database/refunds.repo';
import { requestRefund } from '../../lib/server/payments/refund-service';
import { parse, idSchema, moneyMinorSchema } from '../../lib/server/security/validate';
import { checkRateLimit } from '../../lib/server/security/rate-limit';
import { hashIp } from '../../lib/server/utils/ids';

const requestSchema = z.object({
  paymentId: idSchema,
  amountMinor: moneyMinorSchema.optional(),
  reason: z.string().trim().min(10).max(500)
});

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  const auth = await requireUser(req);

  if (req.method === 'GET') {
    const refunds = await listRefundsByUser(auth.uid);
    sendJson(res, 200, { data: refunds });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);

  await checkRateLimit({
    bucket: 'refund-request',
    identifier: auth.uid,
    limit: 5,
    windowSeconds: 3600
  });

  const body = parse(requestSchema, req.body);
  const refund = await requestRefund({
    paymentId: body.paymentId,
    userId: auth.uid,
    amountMinor: body.amountMinor,
    reason: body.reason,
    ipHash: hashIp(ctx.ip)
  });

  sendJson(res, 201, { data: refund });
});
