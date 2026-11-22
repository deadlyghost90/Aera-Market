import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireApprovedSeller } from '../../lib/server/firebase/guards';
import { requireProduct, attachFile, updateProduct } from '../../lib/server/database/products.repo';
import { headObject } from '../../lib/server/storage/b2';
import { keyBelongsToSeller } from '../../lib/server/storage/keys';
import { parse, idSchema } from '../../lib/server/security/validate';
import { AppError } from '../../lib/server/utils/errors';
import type { ProductFile } from '../../lib/shared/types';

const schema = z.object({
  productId: idSchema,
  key: z.string().trim().min(5).max(400),
  fileId: idSchema,
  name: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().trim().min(1).max(120),
  purpose: z.enum(['file', 'preview'])
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const auth = await requireApprovedSeller(req);
  const body = parse(schema, req.body);

  const product = await requireProduct(body.productId);
  if (product.sellerId !== auth.uid) throw new AppError('FORBIDDEN', 'Not your product');
  if (product.status !== 'DRAFT' && product.status !== 'CHANGES_REQUESTED') {
    throw new AppError('CONFLICT', `Uploads are closed while the product is ${product.status}`);
  }
  if (!keyBelongsToSeller(body.key, auth.uid)) {
    throw new AppError('FORBIDDEN', 'That storage key belongs to another author');
  }

  // Never trust the client's claim about what it uploaded: ask the bucket.
  const stored = await headObject(body.key);
  if (!stored) throw new AppError('BAD_REQUEST', 'The file was not found in storage');
  if (stored.sizeBytes !== body.sizeBytes) {
    throw new AppError('BAD_REQUEST', 'Uploaded size does not match the declared size');
  }

  if (body.purpose === 'preview') {
    const updated = await updateProduct(product.id, { previewUrl: body.key });
    sendJson(res, 200, { data: updated });
    return;
  }

  const file: ProductFile = {
    id: body.fileId,
    key: body.key,
    name: body.name,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType || body.contentType,
    uploadedAt: Date.now(),
    verified: true
  };

  const updated = await attachFile(product.id, file);
  sendJson(res, 200, { data: { files: updated.files } });
});
