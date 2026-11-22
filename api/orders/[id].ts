import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { requireUser } from '../../lib/server/firebase/guards';
import { requireOrder } from '../../lib/server/database/orders.repo';
import { listPaymentsByOrder } from '../../lib/server/database/payments.repo';
import { forbidden } from '../../lib/server/utils/errors';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Order id is required' } });
    return;
  }

  const order = await requireOrder(id);
  const isBuyer = order.buyerId === auth.uid;
  const isSeller = order.items.some((item) => item.sellerId === auth.uid);
  const isAdmin = auth.user.role === 'ADMIN';

  if (!isBuyer && !isSeller && !isAdmin) {
    throw forbidden('This order belongs to someone else');
  }

  const payments = isBuyer || isAdmin ? await listPaymentsByOrder(order.id) : [];

  sendJson(res, 200, {
    data: {
      order,
      payments: payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        refundedAmountMinor: payment.refundedAmountMinor,
        createdAt: payment.createdAt
      }))
    }
  });
});
