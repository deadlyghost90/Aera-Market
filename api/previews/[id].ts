import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route } from '../../lib/server/utils/http';
import { getProduct } from '../../lib/server/database/products.repo';
import { presignPreview } from '../../lib/server/storage/b2';
import { requireUser } from '../../lib/server/firebase/guards';

/**
 * Preview images live in the private bucket, so the catalogue points at this
 * endpoint and it redirects to a short-lived signed URL.
 *
 * Approved products: public.
 * Anything else: only the owning author or an administrator, which is what makes
 * the review queue able to show the image before approval.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Product id is required' } });
    return;
  }

  const product = await getProduct(id);
  if (!product || !product.previewUrl) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Preview not found' } });
    return;
  }

  let allowed = product.status === 'APPROVED';

  if (!allowed) {
    try {
      const auth = await requireUser(req);
      allowed = product.sellerId === auth.uid || auth.user.role === 'ADMIN';
    } catch {
      allowed = false;
    }
  }

  if (!allowed) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Preview not found' } });
    return;
  }

  const url = await presignPreview(product.previewUrl, 600);
  res.statusCode = 302;
  res.setHeader('Cache-Control', allowed && product.status === 'APPROVED' ? 'public, max-age=300' : 'private, no-store');
  res.setHeader('Location', url);
  res.end();
});
