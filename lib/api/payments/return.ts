import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, sendJson } from '../../server/utils/http';
import { getGateway } from '../../server/payments/registry';
import { syncPaymentWithGateway } from '../../server/payments/service';
import { findPaymentIdByTracker } from '../../server/database/payments.repo';
import { writeAudit } from '../../server/security/audit';
import { logger } from '../../server/utils/logger';

/** The gateway posts a form to this URL with the customer's browser. */
export const config = { api: { bodyParser: false } };

async function readForm(req: VercelRequest): Promise<URLSearchParams> {
  // If a platform layer already parsed the form, use it directly.
  const preParsed = (req as unknown as { body?: unknown }).body;
  if (preParsed && typeof preParsed === 'object' && !Buffer.isBuffer(preParsed)) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preParsed as Record<string, unknown>)) {
      if (typeof value === 'string') params.set(key, value);
    }
    if (params.has('tracker')) return params;
  }

  const contentType = String(req.headers['content-type'] ?? '');
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(req);
    return new URLSearchParams(raw);
  }

  // Fallback: some integrations post JSON instead of a form.
  const raw = await readRawBody(req);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') params.set(key, value);
    }
    return params;
  } catch {
    return new URLSearchParams(raw);
  }
}

function redirectTo(res: VercelResponse, path: string): void {
  res.statusCode = 303;
  res.setHeader('Location', path);
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const params = await readForm(req);
  const tracker = params.get('tracker') ?? '';
  const signature = params.get('sig') ?? params.get('signature') ?? '';
  const orderId = params.get('order_id') ?? '';

  if (!tracker || !signature) {
    redirectTo(res, '/order-result?state=invalid');
    return;
  }

  const gateway = getGateway('safepay');
  if (!gateway.verifyRedirectSignature(tracker, signature)) {
    logger.warn('return_signature_invalid', { tracker });
    await writeAudit({
      actorUid: 'system',
      action: 'payment.return_signature_invalid',
      targetType: 'payment',
      targetId: tracker,
      meta: { orderId }
    });
    redirectTo(res, '/order-result?state=invalid_signature');
    return;
  }

  const paymentId = await findPaymentIdByTracker(tracker);
  if (!paymentId) {
    redirectTo(res, `/order-result?state=unknown&order=${encodeURIComponent(orderId)}`);
    return;
  }

  // Authoritative check with the gateway - the redirect alone never settles.
  const { payment } = await syncPaymentWithGateway(paymentId, 'gateway_redirect');

  const query = new URLSearchParams({
    payment: payment.id,
    order: payment.orderId,
    state: payment.status.toLowerCase()
  });

  redirectTo(res, `/order-result?${query.toString()}`);
}
