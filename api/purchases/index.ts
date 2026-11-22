import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { requireUser } from '../../lib/server/firebase/guards';
import { listPurchases } from '../../lib/server/database/purchases.repo';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);
  const purchases = await listPurchases(auth.uid);

  sendJson(res, 200, {
    data: purchases.map((purchase) => ({
      productId: purchase.productId,
      productName: purchase.productName,
      sellerId: purchase.sellerId,
      orderId: purchase.orderId,
      grantedAt: purchase.grantedAt,
      downloadCount: purchase.downloadCount,
      priceMinor: purchase.priceMinor,
      currency: purchase.currency,
      previewUrl: `/api/previews/${encodeURIComponent(purchase.productId)}`
    }))
  });
});
