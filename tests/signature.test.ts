import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signRawBody, signTracker } from '../lib/server/payments/safepay';

describe('gateway signatures', () => {
  // RFC 4231 test vector for HMAC-SHA256, proving the primitive is correct.
  it('matches the RFC 4231 HMAC-SHA256 vector', () => {
    const signature = signTracker('what do ya want for nothing?', 'Jefe');
    assert.equal(signature, '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('produces a 64 character lowercase hex digest', () => {
    assert.match(signTracker('track_abc', 'secret'), /^[0-9a-f]{64}$/);
  });

  it('is deterministic and secret-dependent', () => {
    const a = signTracker('track_abc', 'secret-one');
    const b = signTracker('track_abc', 'secret-one');
    const c = signTracker('track_abc', 'secret-two');
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('distinguishes a bare tracker signature from a payload signature', () => {
    // Same primitive, different message: the tracker alone vs. the JSON body
    // that contains it. This is why the webhook verifier checks both schemes.
    assert.notEqual(
      signTracker('abc', 'secret'),
      signRawBody(JSON.stringify({ tracker: 'abc' }), 'secret')
    );
  });

  it('binds the signature to the exact tracker value', () => {
    assert.notEqual(signTracker('track_good', 'secret'), signTracker('track_evil', 'secret'));
  });
});
