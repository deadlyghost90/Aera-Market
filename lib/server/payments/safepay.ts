import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, webhookSecret } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { toMajorUnits, toMinorUnits } from '../utils/money';
import type {
  GatewayTracker,
  InitiatePaymentInput,
  InitiatePaymentResult,
  NormalisedWebhook,
  PaymentGateway,
  WebhookVerificationInput
} from './types';

/**
 * Safepay (the gateway the merchant account is actually provisioned with).
 *
 * Verified live against the sandbox on 2026-11-22:
 *   POST {base}/order/v1/init  -> 200 { data: { token: "track_..." } }
 *   GET  {base}/order/v1/{tracker} -> tracker JSON with `state`
 *
 * Signature scheme (official WooCommerce plugin + Shopify integration guide):
 *   sig = hex( HMAC-SHA256( tracker, secretKey ) )
 */

const PAID_STATES = new Set([
  'TRACKER_COMPLETED',
  'TRACKER_PAID',
  'TRACKER_AUTHORIZED',
  'COMPLETED',
  'PAID',
  'SUCCESS'
]);

const FAILED_STATES = new Set(['TRACKER_FAILED', 'FAILED', 'DECLINED', 'ERROR']);
const CANCELLED_STATES = new Set(['TRACKER_CANCELLED', 'CANCELLED', 'EXPIRED', 'ABANDONED']);

function safeEqualHex(expected: string, received: string): boolean {
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signTracker(tracker: string, secret: string): string {
  return createHmac('sha256', secret).update(tracker, 'utf8').digest('hex');
}

export function signRawBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function pickSignatureHeader(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null;
  for (const key of ['x-sfpy-signature', 'x-safepay-signature', 'x-signature']) {
    const value = headers[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}

/** Extracts a tracker from the shapes Safepay uses across redirect/webhook payloads. */
export function extractTracker(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.tracker,
    (record.data as Record<string, unknown> | undefined)?.tracker,
    (record.payment as Record<string, unknown> | undefined)?.tracker,
    (record.data as Record<string, unknown> | undefined)?.token
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('track_')) return candidate;
  }
  return null;
}

class SafepayGateway implements PaymentGateway {
  readonly id = 'safepay' as const;

  get environment(): 'sandbox' | 'production' {
    return env().FASTPAY_ENVIRONMENT;
  }

  private baseUrl(): string {
    return env().FASTPAY_BASE_URL.replace(/\/+$/, '');
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const config = env();
    const body = {
      environment: config.FASTPAY_ENVIRONMENT,
      amount: toMajorUnits(input.amountMinor),
      currency: input.currency,
      client: config.FASTPAY_PUBLIC_KEY
    };

    const response = await fetch(`${this.baseUrl()}/order/v1/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    }).catch((error: unknown) => {
      logger.error('safepay_init_network_error', {
        paymentId: input.paymentId,
        message: error instanceof Error ? error.message : 'unknown'
      });
      throw new AppError('GATEWAY_ERROR', 'Payment provider is temporarily unreachable');
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      logger.error('safepay_init_failed', { paymentId: input.paymentId, status: response.status });
      throw new AppError('GATEWAY_ERROR', 'Payment provider rejected the request');
    }

    const tracker = (parsed as { data?: { token?: string } } | null)?.data?.token;
    if (typeof tracker !== 'string' || !tracker.startsWith('track_')) {
      logger.error('safepay_init_bad_payload', { paymentId: input.paymentId });
      throw new AppError('GATEWAY_ERROR', 'Payment provider returned an unexpected response');
    }

    return {
      tracker,
      checkoutUrl: this.buildCheckoutUrl(tracker, input),
      raw: parsed
    };
  }

  buildCheckoutUrl(tracker: string, input: InitiatePaymentInput): string {
    const config = env();
    const url = new URL(config.FASTPAY_CHECKOUT_URL);
    url.searchParams.set('env', config.FASTPAY_ENVIRONMENT);
    url.searchParams.set('beacon', tracker);
    url.searchParams.set('source', 'aera-market');
    url.searchParams.set('order_id', input.orderId);
    url.searchParams.set('redirect_url', `${config.APP_ORIGIN}/api/payments/return`);
    url.searchParams.set('cancel_url', `${config.APP_ORIGIN}/order-result?order=${encodeURIComponent(input.orderId)}&state=cancelled`);
    return url.toString();
  }

  async fetchTracker(tracker: string): Promise<GatewayTracker> {
    const response = await fetch(`${this.baseUrl()}/order/v1/${encodeURIComponent(tracker)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000)
    }).catch(() => {
      throw new AppError('GATEWAY_ERROR', 'Payment provider is temporarily unreachable');
    });

    if (!response.ok) {
      throw new AppError('GATEWAY_ERROR', 'Unable to verify payment with the provider');
    }

    const payload = (await response.json()) as {
      data?: {
        token?: string;
        state?: string;
        amount?: number;
        currency?: string;
        transaction?: unknown;
      };
    };

    const data = payload.data ?? {};
    const rawState = String(data.state ?? 'UNKNOWN').toUpperCase();
    const transaction = data.transaction as
      | { token?: string; state?: string; status?: string; reference?: string }
      | null
      | undefined;

    const transactionState = String(transaction?.state ?? transaction?.status ?? '').toUpperCase();
    const isPaid = PAID_STATES.has(rawState) || PAID_STATES.has(transactionState);

    return {
      tracker: data.token ?? tracker,
      rawState,
      isPaid,
      isFailed: !isPaid && FAILED_STATES.has(rawState),
      isCancelled: !isPaid && CANCELLED_STATES.has(rawState),
      transactionId: transaction?.token ?? null,
      reference: transaction?.reference ?? null,
      amountMinor:
        typeof data.amount === 'number' && Number.isFinite(data.amount)
          ? toMinorUnits(data.amount)
          : null,
      raw: payload
    };
  }

  verifyRedirectSignature(tracker: string, signature: string): boolean {
    if (!tracker || !signature) return false;
    const expected = signTracker(tracker, env().FASTPAY_SECRET_KEY);
    return safeEqualHex(expected, signature);
  }

  /**
   * The webhook signing secret is configured in the Safepay dashboard. When a
   * distinct value is not provided we fall back to the account secret key.
   * Both supported schemes are checked; anything else is rejected.
   */
  verifyWebhookSignature(input: WebhookVerificationInput): boolean {
    const header = input.signatureHeader;
    if (!header) return false;

    const secret = webhookSecret();
    if (safeEqualHex(signRawBody(input.rawBody, secret), header)) return true;

    // Some Safepay webhook payloads sign the tracker instead of the raw body.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return false;
    }
    const tracker = extractTracker(parsed);
    if (tracker && safeEqualHex(signTracker(tracker, secret), header)) return true;

    return false;
  }

  normaliseWebhook(rawBody: string): NormalisedWebhook {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new AppError('BAD_REQUEST', 'Webhook body is not valid JSON');
    }

    const record = (parsed ?? {}) as Record<string, unknown>;
    const data = (record.data ?? {}) as Record<string, unknown>;
    const tracker = extractTracker(parsed);

    const rawState = String(
      record.state ?? record.status ?? data.state ?? record.event ?? record.type ?? 'UNKNOWN'
    ).toUpperCase();

    const eventType = String(record.event ?? record.type ?? rawState);
    const eventId = String(
      record.id ??
        record.event_id ??
        (data.token as string | undefined) ??
        `${tracker ?? 'unknown'}_${eventType}`
    );

    return {
      eventId,
      eventType,
      tracker,
      isPaid: PAID_STATES.has(rawState),
      isFailed: FAILED_STATES.has(rawState),
      isCancelled: CANCELLED_STATES.has(rawState),
      raw: parsed
    };
  }
}

export { pickSignatureHeader };
export const safepay = new SafepayGateway();
