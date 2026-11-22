import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireUser } from '../../lib/server/firebase/guards';
import { initiatePayment } from '../../lib/server/payments/service';
import { parse, idSchema } from '../../lib/server/security/validate';
import { checkRateLimit } from '../../lib/server/security/rate-limit';
import { hashIp } from '../../lib/server/utils/ids';

const schema = z.object({ orderId: idSchema });

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const auth = await requireUser(req);

  await checkRateLimit({
    bucket: 'pay-init',
    identifier: auth.uid,
    limit: 20,
    windowSeconds: 600
  });

  const body = parse(schema, req.body);

  const result = await initiatePayment({
    orderId: body.orderId,
    userId: auth.uid,
    ipHash: hashIp(ctx.ip)
  });

  sendJson(res, result.reused ? 200 : 201, {
    data: {
      paymentId: result.payment.id,
      status: result.payment.status,
      amountMinor: result.payment.amountMinor,
      currency: result.payment.currency,
      checkoutUrl: result.checkoutUrl,
      gateway: result.payment.gateway
    }
  });
});
