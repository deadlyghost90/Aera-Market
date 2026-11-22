import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireUser } from '../../lib/server/firebase/guards';
import { getPurchase, incrementDownloadCount } from '../../lib/server/database/purchases.repo';
import { requireProduct } from '../../lib/server/database/products.repo';
import { presignDownload } from '../../lib/server/storage/b2';
import { writeAudit } from '../../lib/server/security/audit';
import { checkRateLimit } from '../../lib/server/security/rate-limit';
import { parse, idSchema } from '../../lib/server/security/validate';
import { AppError } from '../../lib/server/utils/errors';

const schema = z.object({
  productId: idSchema,
  fileId: idSchema.optional()
});

/**
 * Download authorisation. The bucket is private, so a file can only be fetched
 * with a short-lived signed URL issued after proving the buyer owns the product.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const auth = await requireUser(req);

  await checkRateLimit({
    bucket: 'download-auth',
    identifier: auth.uid,
    limit: 60,
    windowSeconds: 3600
  });

  const body = parse(schema, req.body);

  const purchase = await getPurchase(auth.uid, body.productId);
  if (!purchase) {
    throw new AppError('FORBIDDEN', 'You have not purchased this product');
  }

  const product = await requireProduct(body.productId);
  const file = body.fileId
    ? product.files.find((candidate) => candidate.id === body.fileId)
    : product.files[0];

  if (!file) throw new AppError('NOT_FOUND', 'This product has no deliverable file');

  const url = await presignDownload({
    key: file.key,
    fileName: file.name,
    expiresInSeconds: 120
  });

  await incrementDownloadCount(auth.uid, product.id).catch(() => undefined);

  await writeAudit({
    actorUid: auth.uid,
    action: 'download.authorized',
    targetType: 'product',
    targetId: product.id,
    meta: { fileId: file.id, orderId: purchase.orderId }
  });

  sendJson(res, 200, {
    data: { url, fileName: file.name, expiresInSeconds: 120 }
  });
});
