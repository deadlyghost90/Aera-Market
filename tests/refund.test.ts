import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRefundLedger } from '../lib/server/payments/allocation';
import { remainingRefundableMinor } from '../lib/server/utils/money';
import type { OrderItem, Payment } from '../lib/shared/types';

const items: OrderItem[] = [
  {
    productId: 'prod_1',
    productName: 'Digital product',
    sellerId: 'seller_1',
    unitPriceMinor: 100_000,
    quantity: 1
  }
];

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    orderId: 'ord_1',
    userId: 'user_1',
    productId: 'prod_1',
    productName: 'Digital product',
    gateway: 'safepay',
    gatewayEnvironment: 'sandbox',
    gatewayTrackerId: 'track_1',
    gatewayTransactionId: null,
    gatewayReference: null,
    gatewayResponseRef: null,
    checkoutUrl: null,
    paymentMethod: null,
    status: 'PAID',
    amountMinor: 100_000,
    refundedAmountMinor: 0,
    refundStatus: null,
    currency: 'PKR',
    commissionPercent: 40,
    commissionMinor: 40_000,
    sellerPayableMinor: 60_000,
    failureReason: null,
    idempotencyKey: null,
    createdAt: 0,
    updatedAt: 0,
    completedAt: 0,
    lastStatusAt: 0,
    ...overrides
  };
}

describe('refund accounting', () => {
  it('full refund reverses the sale and the commission exactly', () => {
    const entries = buildRefundLedger(payment(), items, 100_000, 100_000);
    const seller = entries.filter((e) => e.sellerId !== 'platform');
    const platform = entries.filter((e) => e.sellerId === 'platform');

    assert.equal(seller.reduce((sum, e) => sum + e.amountMinor, 0), -60_000);
    assert.equal(platform.reduce((sum, e) => sum + e.amountMinor, 0), -40_000);
  });

  it('partial refund keeps the seller share proportional', () => {
    // Refund PKR 400 of a PKR 1,000 order: seller funds 240, platform reverses 160.
    const entries = buildRefundLedger(payment(), items, 40_000, 100_000);
    const seller = entries.filter((e) => e.sellerId !== 'platform');

    assert.equal(seller.reduce((sum, e) => sum + e.amountMinor, 0), -24_000);
    assert.equal(entries.find((e) => e.type === 'COMMISSION_REVERSAL')?.amountMinor, -16_000);
  });

  it('refund entries are always negative for the seller', () => {
    const entries = buildRefundLedger(payment(), items, 12_345, 100_000);
    for (const entry of entries.filter((e) => e.sellerId !== 'platform')) {
      assert.ok(entry.amountMinor < 0);
    }
  });

  it('splits a multi-seller refund without losing a paisa', () => {
    const multi: OrderItem[] = [
      { ...items[0]!, sellerId: 'seller_a', unitPriceMinor: 60_000 },
      { ...items[0]!, sellerId: 'seller_b', unitPriceMinor: 40_000 }
    ];
    const entries = buildRefundLedger(payment(), multi, 100_000, 100_000);
    const sum = entries.reduce((total, entry) => total + entry.amountMinor, 0);
    assert.equal(sum, -100_000);
  });

  it('computes the remaining refundable balance', () => {
    assert.equal(remainingRefundableMinor(100_000, 0), 100_000);
    assert.equal(remainingRefundableMinor(100_000, 40_000), 60_000);
    assert.equal(remainingRefundableMinor(100_000, 100_000), 0);
    assert.equal(remainingRefundableMinor(100_000, 120_000), 0);
  });
});
