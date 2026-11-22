import type { PaymentStatus } from '../../shared/enums';
import { AppError } from '../utils/errors';

export type TransitionSource =
  | 'api'
  | 'gateway_redirect'
  | 'gateway_webhook'
  | 'admin'
  | 'system';

/**
 * Allowed payment status transitions.
 *
 * FAILED and CANCELLED are terminal for every browser-initiated path. The only
 * exception is a *verified* gateway webhook, which may recover a payment we
 * prematurely marked failed (for example after a timeout on our side) - the
 * gateway is the source of truth for whether money moved.
 */
export const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PENDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
  PENDING: ['PROCESSING', 'PAID', 'FAILED', 'CANCELLED'],
  PROCESSING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUND_PENDING: ['PARTIALLY_REFUNDED', 'REFUNDED', 'PAID'],
  PARTIALLY_REFUNDED: ['REFUND_PENDING', 'REFUNDED'],
  REFUNDED: []
};

const RECOVERABLE_FROM: readonly PaymentStatus[] = ['FAILED', 'CANCELLED'];

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  source: TransitionSource = 'api'
): boolean {
  if (from === to) return true;
  if (ALLOWED_TRANSITIONS[from].includes(to)) return true;

  // Gateway-confirmed recovery of a locally failed/cancelled payment.
  if (to === 'PAID' && RECOVERABLE_FROM.includes(from) && source === 'gateway_webhook') {
    return true;
  }

  return false;
}

export function assertTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  source: TransitionSource = 'api'
): void {
  if (!canTransition(from, to, source)) {
    throw new AppError('INVALID_TRANSITION', `Cannot move a payment from ${from} to ${to}`, {
      from,
      to,
      source
    });
  }
}

export function isPaidStatus(status: PaymentStatus): boolean {
  return status === 'PAID' || status === 'PARTIALLY_REFUNDED' || status === 'REFUNDED';
}

export function isRefundableStatus(status: PaymentStatus): boolean {
  return status === 'PAID' || status === 'PARTIALLY_REFUNDED';
}

export function isTerminal(status: PaymentStatus): boolean {
  return status === 'REFUNDED' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * Status implied by total refunded amount. Used when a refund completes.
 */
export function statusAfterRefund(
  amountMinor: number,
  refundedMinor: number
): 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' {
  if (refundedMinor <= 0) return 'PAID';
  if (refundedMinor >= amountMinor) return 'REFUNDED';
  return 'PARTIALLY_REFUNDED';
}
