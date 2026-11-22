import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { getProduct } from '../../lib/server/database/products.repo';
import { notFound } from '../../lib/server/utils/errors';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Product id is required' } });
    return;
  }

  const product = await getProduct(id);
  if (!product || product.status !== 'ACTIVE') throw notFound('Product not found');

  sendJson(res, 200, {
    data: {
      id: product.id,
      title: product.title,
      description: product.description,
      priceMinor: product.priceMinor,
      currency: product.currency,
      sellerId: product.sellerId,
      categoryId: product.categoryId
    }
  });
});
