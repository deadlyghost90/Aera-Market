import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route } from '../../lib/server/utils/http';
import { getProduct } from '../../lib/server/database/products.repo';
import { presignPreview } from '../../lib/server/storage/b2';

/**
 * Preview images live in the private bucket too, so the catalogue points at
 * this endpoint and it redirects to a short-lived signed URL.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Product id is required' } });
    return;
  }

  const product = await getProduct(id);
  if (!product || product.status !== 'APPROVED' || !product.previewUrl) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Preview not found' } });
    return;
  }

  const url = await presignPreview(product.previewUrl, 600);
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Location', url);
  res.end();
});
