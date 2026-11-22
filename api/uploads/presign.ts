import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireApprovedSeller } from '../../lib/server/firebase/guards';
import { requireProduct } from '../../lib/server/database/products.repo';
import { requireCategory } from '../../lib/server/database/categories.repo';
import { presignUpload } from '../../lib/server/storage/b2';
import { extensionOf, previewKey, productFileKey, safeFileName } from '../../lib/server/storage/keys';
import { newId } from '../../lib/server/utils/ids';
import { parse, idSchema } from '../../lib/server/security/validate';
import { checkRateLimit } from '../../lib/server/security/rate-limit';
import { AppError } from '../../lib/server/utils/errors';

const schema = z.object({
  productId: idSchema,
  fileName: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive().max(2_000_000_000),
  contentType: z.string().trim().min(1).max(120),
  purpose: z.enum(['file', 'preview'])
});

const EDITABLE = new Set(['DRAFT', 'CHANGES_REQUESTED']);

export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const auth = await requireApprovedSeller(req);

  await checkRateLimit({
    bucket: 'upload-presign',
    identifier: auth.uid,
    limit: 60,
    windowSeconds: 3600
  });

  const body = parse(schema, req.body);
  const product = await requireProduct(body.productId);

  if (product.sellerId !== auth.uid) throw new AppError('FORBIDDEN', 'Not your product');
  if (!EDITABLE.has(product.status)) {
    throw new AppError('CONFLICT', `Uploads are closed while the product is ${product.status}`);
  }

  const category = await requireCategory(product.categoryId);
  const name = safeFileName(body.fileName);
  const extension = extensionOf(name);

  if (extension && !category.allowedExtensions.includes(extension)) {
    throw new AppError(
      'BAD_REQUEST',
      `"${extension}" files are not accepted in ${category.name}`
    );
  }

  if (body.sizeBytes > category.maxFileMb * 1024 * 1024) {
    throw new AppError('BAD_REQUEST', `Maximum size in ${category.name} is ${category.maxFileMb} MB`);
  }

  const fileId = newId('file');
  const key =
    body.purpose === 'preview'
      ? previewKey(auth.uid, product.id, fileId, name)
      : productFileKey(auth.uid, product.id, fileId, name);

  const uploadUrl = await presignUpload({
    key,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    expiresInSeconds: 600
  });

  sendJson(res, 200, {
    data: { uploadUrl, key, fileId, name, expiresInSeconds: 600, purpose: body.purpose }
  });
});
