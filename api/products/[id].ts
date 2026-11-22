import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { requireUser } from '../../lib/server/firebase/guards';
import { getProduct } from '../../lib/server/database/products.repo';
import { forbidden, notFound } from '../../lib/server/utils/errors';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Product id is required' } });
    return;
  }

  const product = await getProduct(id);
  if (!product) throw notFound('Product not found');

  if (product.status === 'APPROVED') {
    // Public projection: storage keys never leave the server.
    sendJson(
      res,
      200,
      {
        data: {
          id: product.id,
          title: product.title,
          summary: product.summary,
          description: product.description,
          kind: product.kind,
          license: product.license,
          priceMinor: product.priceMinor,
          currency: product.currency,
          tags: product.tags,
          rating: product.rating,
          salesCount: product.salesCount,
          sellerId: product.sellerId,
          sellerName: product.sellerName,
          categoryId: product.categoryId,
          previewUrl: product.previewUrl ? `/api/previews/${product.id}` : null,
          demoUrl: product.demoUrl,
          documentationUrl: product.documentationUrl,
          files: product.files.map((file) => ({ name: file.name, sizeBytes: file.sizeBytes }))
        }
      },
      'public, s-maxage=120, stale-while-revalidate=600'
    );
    return;
  }

  // Non-public products are visible to their owner and to admins only.
  let viewer: { uid: string; role: string };
  try {
    const auth = await requireUser(req);
    viewer = { uid: auth.uid, role: auth.user.role };
  } catch {
    throw notFound('Product not found');
  }

  if (product.sellerId !== viewer.uid && viewer.role !== 'ADMIN') {
    throw forbidden('This product is not public');
  }

  sendJson(res, 200, { data: product });
});
