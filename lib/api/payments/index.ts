import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../server/utils/http';
import { requireUser } from '../../server/firebase/guards';
import { listPaymentsByUser } from '../../server/database/payments.repo';
import { summariseCustomer } from '../../server/payments/stats';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);
  const payments = await listPaymentsByUser(auth.uid, 100);
  const summary = summariseCustomer(payments);

  sendJson(res, 200, {
    data: {
      summary,
      payments: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        productName: payment.productName,
        status: payment.status,
        amountMinor: payment.amountMinor,
        refundedAmountMinor: payment.refundedAmountMinor,
        currency: payment.currency,
        gateway: payment.gateway,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt
      }))
    }
  });
});
