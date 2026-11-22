import type { GatewayId } from '../../shared/enums';

export interface InitiatePaymentInput {
  amountMinor: number;
  currency: string;
  orderId: string;
  paymentId: string;
}

export interface InitiatePaymentResult {
  tracker: string;
  checkoutUrl: string;
  raw: unknown;
}

export interface GatewayTracker {
  tracker: string;
  /** Raw gateway state, stored for support and debugging. */
  rawState: string;
  isPaid: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  /** Gateway-side transaction identifier, when the tracker exposes one. */
  transactionId: string | null;
  reference: string | null;
  amountMinor: number | null;
  raw: unknown;
}

export interface WebhookVerificationInput {
  rawBody: string;
  signatureHeader: string | null;
}

export interface NormalisedWebhook {
  eventId: string;
  eventType: string;
  tracker: string | null;
  isPaid: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  raw: unknown;
}

/**
 * The contract every gateway must satisfy. Payment history, orders, refunds and
 * commissions depend only on this interface, so adding a provider later never
 * requires touching the financial model.
 */
export interface PaymentGateway {
  readonly id: GatewayId;
  readonly environment: 'sandbox' | 'production';
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  fetchTracker(tracker: string): Promise<GatewayTracker>;
  verifyRedirectSignature(tracker: string, signature: string): boolean;
  verifyWebhookSignature(input: WebhookVerificationInput): boolean;
  normaliseWebhook(rawBody: string): NormalisedWebhook;
}
