import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Privacy-preserving identifier for abuse records and logs. */
export function hashIp(ip: string): string {
  return sha256Hex(`aera:${ip}`).slice(0, 32);
}

/** Deterministic idempotency key for a payment attempt on an order. */
export function paymentIdempotencyKey(orderId: string, userId: string): string {
  return sha256Hex(`pay:${orderId}:${userId}`).slice(0, 40);
}
