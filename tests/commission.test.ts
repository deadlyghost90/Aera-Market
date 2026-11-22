import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitCommission } from '../lib/server/utils/money';
import { allocateBySeller } from '../lib/server/payments/allocation';
import type { OrderItem } from '../lib/shared/types';

const item = (sellerId: string, priceMinor: number): OrderItem => ({
  productId: `prod_${sellerId}`,
  productName: 'Test product',
  sellerId,
  unitPriceMinor: priceMinor,
  quantity: 1
});

describe('commission calculation', () => {
  it('splits PKR 1,000 at 40% into 400 / 600', () => {
    const result = splitCommission(100_000, 40);
    assert.equal(result.commissionMinor, 40_000);
    assert.equal(result.sellerPayableMinor, 60_000);
  });

  it('never loses or creates a paisa', () => {
    for (const amount of [1, 7, 99, 101, 999, 123_457, 10_000_001]) {
      for (const pct of [0, 5, 33, 40, 50, 100]) {
        const { commissionMinor, sellerPayableMinor } = splitCommission(amount, pct);
        assert.equal(commissionMinor + sellerPayableMinor, amount);
        assert.ok(commissionMinor >= 0);
        assert.ok(sellerPayableMinor >= 0);
      }
    }
  });

  it('rejects invalid percentages and fractional amounts', () => {
    assert.throws(() => splitCommission(100, 101));
    assert.throws(() => splitCommission(100.5, 40));
    assert.throws(() => splitCommission(-1, 40));
  });

  it('allocates per seller and keeps the order total exact', () => {
    const allocations = allocateBySeller([item('seller_a', 60_000), item('seller_b', 40_000)], 40);

    assert.equal(allocations.length, 2);
    const commission = allocations.reduce((sum, a) => sum + a.commissionMinor, 0);
    const payable = allocations.reduce((sum, a) => sum + a.sellerPayableMinor, 0);

    assert.equal(commission, 40_000);
    assert.equal(payable, 60_000);
    assert.equal(commission + payable, 100_000);
  });

  it('absorbs rounding in the last allocation', () => {
    const allocations = allocateBySeller([item('a', 333), item('b', 333), item('c', 334)], 40);
    const total = allocations.reduce((sum, a) => sum + a.commissionMinor + a.sellerPayableMinor, 0);
    assert.equal(total, 1000);
  });

  it('returns nothing for an empty order', () => {
    assert.deepEqual(allocateBySeller([], 40), []);
  });
});
