import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { requireUser } from '../../lib/server/firebase/guards';
import { listSellerProducts } from '../../lib/server/database/products.repo';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);
  const products = await listSellerProducts(auth.uid, 200);

  sendJson(res, 200, {
    data: products.map((product) => ({
      id: product.id,
      title: product.title,
      summary: product.summary,
      status: product.status,
      kind: product.kind,
      priceMinor: product.priceMinor,
      currency: product.currency,
      files: product.files.length,
      previewUrl: product.previewUrl ? `/api/previews/${product.id}` : null,
      rejectionNote: product.rejectionNote,
      review: product.review,
      updatedAt: product.updatedAt
    }))
  });
});
