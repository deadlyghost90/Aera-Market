import { splitCommission } from '../utils/money';
import type { LedgerEntry, OrderItem, Payment } from '../../shared/types';

export interface SellerAllocation {
  sellerId: string;
  subtotalMinor: number;
  commissionMinor: number;
  sellerPayableMinor: number;
}

/**
 * Splits an order across sellers and applies the platform commission to each
 * seller's subtotal. The final allocation absorbs rounding so the parts always
 * sum back to the order total.
 */
export function allocateBySeller(items: OrderItem[], commissionPercent: number): SellerAllocation[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const line = item.unitPriceMinor * item.quantity;
    totals.set(item.sellerId, (totals.get(item.sellerId) ?? 0) + line);
  }

  const entries = [...totals.entries()];
  if (entries.length === 0) return [];

  const grandTotal = entries.reduce((sum, [, value]) => sum + value, 0);
  const targetCommission = splitCommission(grandTotal, commissionPercent).commissionMinor;

  let allocated = 0;
  return entries.map(([sellerId, subtotalMinor], index) => {
    const isLast = index === entries.length - 1;
    const commissionMinor = isLast
      ? Math.max(0, targetCommission - allocated)
      : Math.round((subtotalMinor * commissionPercent) / 100);
    allocated += commissionMinor;
    return {
      sellerId,
      subtotalMinor,
      commissionMinor,
      sellerPayableMinor: subtotalMinor - commissionMinor
    };
  });
}

/**
 * Refund accounting: the seller funds their share of the gross refund while the
 * platform reverses its commission share. Rounding is absorbed by the last
 * seller so totals reconcile exactly.
 */
export function buildRefundLedger(
  payment: Payment,
  items: OrderItem[],
  refundAmountMinor: number,
  orderTotalMinor: number
): Omit<LedgerEntry, 'id'>[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.sellerId, (totals.get(item.sellerId) ?? 0) + item.unitPriceMinor * item.quantity);
  }

  const sellers = [...totals.entries()];
  const entries: Omit<LedgerEntry, 'id'>[] = [];
  const now = Date.now();

  let allocated = 0;
  sellers.forEach(([sellerId, subtotal], index) => {
    const isLast = index === sellers.length - 1;
    const grossShare = isLast
      ? refundAmountMinor - allocated
      : Math.round((refundAmountMinor * subtotal) / orderTotalMinor);
    allocated += grossShare;

    const { commissionMinor } = splitCommission(Math.max(0, grossShare), payment.commissionPercent);
    const sellerDebit = grossShare - commissionMinor;

    if (sellerDebit !== 0) {
      entries.push({
        paymentId: payment.id,
        orderId: payment.orderId,
        sellerId,
        type: 'REFUND',
        amountMinor: -sellerDebit,
        currency: payment.currency,
        createdAt: now
      });
    }

    if (commissionMinor !== 0) {
      entries.push({
        paymentId: payment.id,
        orderId: payment.orderId,
        sellerId: 'platform',
        type: 'COMMISSION_REVERSAL',
        amountMinor: -commissionMinor,
        currency: payment.currency,
        createdAt: now
      });
    }
  });

  return entries;
}

/** Sum of every entry that touches a seller balance (platform rows excluded). */
export function sellerBalanceDelta(entries: Array<Omit<LedgerEntry, 'id'>>): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const entry of entries) {
    if (entry.sellerId === 'platform') continue;
    deltas.set(entry.sellerId, (deltas.get(entry.sellerId) ?? 0) + entry.amountMinor);
  }
  return deltas;
}
