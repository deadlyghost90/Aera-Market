import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../../lib/server/utils/http';
import { requireUser } from '../../../lib/server/firebase/guards';
import { requirePayment, listPaymentEvents } from '../../../lib/server/database/payments.repo';
import { syncPaymentWithGateway } from '../../../lib/server/payments/service';
import { forbidden } from '../../../lib/server/utils/errors';
import { isPaidStatus } from '../../../lib/server/payments/state';

/**
 * The browser polls this endpoint after returning from the hosted checkout.
 * It never trusts the browser: if the payment is still open we ask the gateway
 * for the authoritative state and only then settle it.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Payment id is required' } });
    return;
  }

  let payment = await requirePayment(id);
  if (payment.userId !== auth.uid && auth.user.role !== 'ADMIN') {
    throw forbidden('This payment belongs to another customer');
  }

  let gatewayState = 'UNKNOWN';
  if (!isPaidStatus(payment.status) && payment.gatewayTrackerId) {
    const synced = await syncPaymentWithGateway(payment.id, 'api');
    payment = synced.payment;
    gatewayState = synced.gatewayState;
  }

  const events = await listPaymentEvents(payment.id);

  sendJson(res, 200, {
    data: {
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        productName: payment.productName,
        status: payment.status,
        amountMinor: payment.amountMinor,
        refundedAmountMinor: payment.refundedAmountMinor,
        currency: payment.currency,
        gateway: payment.gateway,
        gatewayEnvironment: payment.gatewayEnvironment,
        gatewayReference: payment.gatewayReference,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt
      },
      gatewayState,
      events: events.map((event) => ({
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        source: event.source,
        createdAt: event.createdAt
      }))
    }
  });
});
