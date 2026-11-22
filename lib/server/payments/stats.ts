import { listRecentPayments } from '../database/payments.repo';
import { listRecentRefunds } from '../database/refunds.repo';
import { listSellerBalances } from '../database/ledger.repo';
import { isPaidStatus } from './state';
import type { Payment } from '../../shared/types';

export interface PaymentStats {
  scannedPayments: number;
  scanLimit: number;
  scanComplete: boolean;
  totalVolumeMinor: number;
  successfulCount: number;
  failedCount: number;
  pendingCount: number;
  refundedAmountMinor: number;
  platformCommissionMinor: number;
  sellerPayableMinor: number;
  openRefundRequests: number;
  currency: string;
}

/**
 * Aggregates are computed from the payment records themselves rather than a
 * counter cache, so they can never drift from the ledger. The scan is bounded;
 * `scanComplete` tells the admin UI when a limit was hit.
 */
export async function computePaymentStats(limit = 1000): Promise<PaymentStats> {
  const payments = await listRecentPayments(limit);
  const refunds = await listRecentRefunds(limit);
  const balances = await listSellerBalances(limit);

  let totalVolumeMinor = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let refundedAmountMinor = 0;
  let platformCommissionMinor = 0;

  for (const payment of payments) {
    if (isPaidStatus(payment.status)) {
      successfulCount += 1;
      totalVolumeMinor += payment.amountMinor;
      refundedAmountMinor += payment.refundedAmountMinor;

      const grossCommission = commissionOn(payment.amountMinor, payment.commissionPercent);
      const reversed = commissionOn(payment.refundedAmountMinor, payment.commissionPercent);
      platformCommissionMinor += grossCommission - reversed;
    } else if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
      failedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const sellerPayableMinor = balances.reduce((sum, balance) => sum + balance.availableMinor, 0);

  return {
    scannedPayments: payments.length,
    scanLimit: limit,
    scanComplete: payments.length < limit,
    totalVolumeMinor,
    successfulCount,
    failedCount,
    pendingCount,
    refundedAmountMinor,
    platformCommissionMinor,
    sellerPayableMinor,
    openRefundRequests: refunds.filter(
      (refund) => refund.status === 'REQUESTED' || refund.status === 'APPROVED'
    ).length,
    currency: 'PKR'
  };
}

function commissionOn(amountMinor: number, percent: number): number {
  return Math.round((amountMinor * percent) / 100);
}

export function summariseCustomer(payments: Payment[]): {
  totalSpentMinor: number;
  paidCount: number;
  refundedMinor: number;
} {
  return payments.reduce(
    (acc, payment) => {
      if (isPaidStatus(payment.status)) {
        acc.totalSpentMinor += payment.amountMinor - payment.refundedAmountMinor;
        acc.paidCount += 1;
        acc.refundedMinor += payment.refundedAmountMinor;
      }
      return acc;
    },
    { totalSpentMinor: 0, paidCount: 0, refundedMinor: 0 }
  );
}
