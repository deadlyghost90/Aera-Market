import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../../lib/server/utils/http';
import { env } from '../../../lib/server/config/env';
import { requireAdmin } from '../../../lib/server/firebase/guards';
import { decideRefund } from '../../../lib/server/payments/refund-service';
import { parse } from '../../../lib/server/security/validate';
import { AppError } from '../../../lib/server/utils/errors';

const schema = z.object({
  action: z.enum(['approve', 'reject', 'complete']),
  note: z.string().trim().max(500).optional(),
  gatewayRefundId: z.string().trim().max(120).optional()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method !== 'PATCH' && req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) throw new AppError('BAD_REQUEST', 'Refund id is required');

  const body = parse(schema, req.body);

  const result = await decideRefund({
    refundId: id,
    adminUid: auth.uid,
    action: body.action,
    note: body.note,
    gatewayRefundId: body.gatewayRefundId
  });

  sendJson(res, 200, { data: result });
});
