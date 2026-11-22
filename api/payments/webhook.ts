import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, sendJson } from '../../lib/server/utils/http';
import { getGateway } from '../../lib/server/payments/registry';
import { pickSignatureHeader } from '../../lib/server/payments/safepay';
import { markPaymentFailed, settlePayment } from '../../lib/server/payments/service';
import {
  findPaymentIdByTracker,
  firstWebhookDelivery,
  releaseWebhookDelivery
} from '../../lib/server/database/payments.repo';
import { writeAudit } from '../../lib/server/security/audit';
import { sha256Hex } from '../../lib/server/utils/ids';
import { logger } from '../../lib/server/utils/logger';

/** Raw body is required for signature verification. */
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const rawBody = await readRawBody(req);
  const gateway = getGateway('safepay');
  const signature = pickSignatureHeader(req.headers as Record<string, unknown>);

  let verified = gateway.verifyWebhookSignature({ rawBody, signatureHeader: signature });

  // Hosting platforms may hand us a re-serialised body when they parse it
  // before the function runs. Try the canonical compact form as a fallback;
  // the HMAC still has to validate against our secret either way.
  if (!verified && rawBody.trim().startsWith('{')) {
    try {
      const canonical = JSON.stringify(JSON.parse(rawBody));
      if (canonical !== rawBody) {
        verified = gateway.verifyWebhookSignature({
          rawBody: canonical,
          signatureHeader: signature
        });
      }
    } catch {
      // Not JSON - nothing more to try.
    }
  }

  if (!verified) {
    logger.warn('webhook_signature_invalid');
    await writeAudit({
      actorUid: 'system',
      action: 'webhook.signature_invalid',
      targetType: 'webhook',
      targetId: 'safepay',
      meta: { bodyHash: sha256Hex(rawBody).slice(0, 16) }
    });
    sendJson(res, 401, { error: { code: 'GATEWAY_SIGNATURE_INVALID', message: 'Invalid signature' } });
    return;
  }

  let event;
  try {
    event = gateway.normaliseWebhook(rawBody);
  } catch {
    sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Malformed webhook payload' } });
    return;
  }

  const payloadHash = sha256Hex(rawBody);
  const isFirstDelivery = await firstWebhookDelivery('safepay', event.eventId, payloadHash);
  if (!isFirstDelivery) {
    sendJson(res, 200, { data: { received: true, duplicate: true } });
    return;
  }

  try {
    if (!event.tracker) {
      sendJson(res, 200, { data: { received: true, ignored: 'no tracker' } });
      return;
    }

    const paymentId = await findPaymentIdByTracker(event.tracker);
    if (!paymentId) {
      logger.warn('webhook_unknown_tracker', { tracker: event.tracker });
      sendJson(res, 200, { data: { received: true, ignored: 'unknown tracker' } });
      return;
    }

    if (event.isPaid) {
      // Never trust the payload alone: confirm with the gateway first.
      const tracker = await gateway.fetchTracker(event.tracker);
      if (!tracker.isPaid) {
        logger.warn('webhook_paid_but_gateway_pending', {
          paymentId,
          state: tracker.rawState
        });
        await releaseWebhookDelivery('safepay', event.eventId);
        sendJson(res, 200, { data: { received: true, pending: true } });
        return;
      }

      const { settled } = await settlePayment({
        paymentId,
        source: 'gateway_webhook',
        transactionId: tracker.transactionId,
        reference: tracker.reference,
        gatewayState: tracker.rawState
      });

      sendJson(res, 200, { data: { received: true, settled } });
      return;
    }

    if (event.isCancelled) {
      await markPaymentFailed({
        paymentId,
        reason: 'Gateway reported a cancelled payment',
        source: 'gateway_webhook',
        status: 'CANCELLED'
      });
      sendJson(res, 200, { data: { received: true } });
      return;
    }

    if (event.isFailed) {
      await markPaymentFailed({
        paymentId,
        reason: `Gateway reported ${event.eventType}`,
        source: 'gateway_webhook'
      });
      sendJson(res, 200, { data: { received: true } });
      return;
    }

    sendJson(res, 200, { data: { received: true, ignored: 'no terminal state' } });
  } catch (error) {
    // Release the claim so the gateway's retry is processed rather than dropped.
    await releaseWebhookDelivery('safepay', event.eventId).catch(() => undefined);
    logger.error('webhook_processing_failed', {
      eventId: event.eventId,
      message: error instanceof Error ? error.message : 'unknown'
    });
    sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Webhook processing failed' } });
  }
}
