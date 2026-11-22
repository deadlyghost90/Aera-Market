import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  assertTransition,
  statusAfterRefund,
  isPaidStatus,
  isRefundableStatus
} from '../lib/server/payments/state';

describe('payment state machine', () => {
  it('allows the normal payment path', () => {
    assert.equal(canTransition('CREATED', 'PENDING'), true);
    assert.equal(canTransition('PENDING', 'PROCESSING'), true);
    assert.equal(canTransition('PROCESSING', 'PAID'), true);
  });

  it('never upgrades a failed or cancelled payment from a browser request', () => {
    assert.equal(canTransition('FAILED', 'PAID', 'api'), false);
    assert.equal(canTransition('FAILED', 'PAID', 'gateway_redirect'), false);
    assert.equal(canTransition('CANCELLED', 'PAID', 'api'), false);
    assert.equal(canTransition('CANCELLED', 'PAID', 'admin'), false);
  });

  it('lets a verified webhook recover a locally failed payment', () => {
    assert.equal(canTransition('FAILED', 'PAID', 'gateway_webhook'), true);
    assert.equal(canTransition('CANCELLED', 'PAID', 'gateway_webhook'), true);
  });

  it('treats refunded as terminal', () => {
    assert.equal(canTransition('REFUNDED', 'PAID', 'gateway_webhook'), false);
    assert.equal(canTransition('REFUNDED', 'REFUND_PENDING'), false);
  });

  it('only refunds paid payments', () => {
    assert.equal(canTransition('PAID', 'REFUND_PENDING'), true);
    assert.equal(canTransition('PARTIALLY_REFUNDED', 'REFUND_PENDING'), true);
    assert.equal(canTransition('PENDING', 'REFUND_PENDING'), false);
  });

  it('rejects illegal transitions with a typed error', () => {
    assert.throws(() => assertTransition('FAILED', 'PAID'), /Cannot move a payment/);
  });

  it('derives the status implied by a refunded total', () => {
    assert.equal(statusAfterRefund(1000, 0), 'PAID');
    assert.equal(statusAfterRefund(1000, 400), 'PARTIALLY_REFUNDED');
    assert.equal(statusAfterRefund(1000, 1000), 'REFUNDED');
    assert.equal(statusAfterRefund(1000, 1200), 'REFUNDED');
  });

  it('classifies paid and refundable states', () => {
    assert.equal(isPaidStatus('PAID'), true);
    assert.equal(isPaidStatus('PARTIALLY_REFUNDED'), true);
    assert.equal(isPaidStatus('PENDING'), false);
    assert.equal(isRefundableStatus('REFUNDED'), false);
    assert.equal(isRefundableStatus('PAID'), true);
  });
});
