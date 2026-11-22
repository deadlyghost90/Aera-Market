/**
 * Money helpers. Every amount in the system is an integer in minor units
 * (paisa for PKR). Floating point is never used for storage or arithmetic.
 */

export const ZERO = 0;

export function assertIntegerMinor(value: number, label = 'amount'): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer in minor units, received ${value}`);
  }
  if (value < 0) {
    throw new Error(`${label} must not be negative, received ${value}`);
  }
}

/** 12345 -> 123.45 (gateway-facing major units) */
export function toMajorUnits(amountMinor: number): number {
  assertIntegerMinor(amountMinor);
  return Math.round(amountMinor) / 100;
}

/** 123.45 -> 12345 */
export function toMinorUnits(amountMajor: number): number {
  if (!Number.isFinite(amountMajor) || amountMajor < 0) {
    throw new Error(`Invalid major-unit amount: ${amountMajor}`);
  }
  return Math.round(amountMajor * 100);
}

export function formatMinor(amountMinor: number, currency = 'PKR'): string {
  const major = amountMinor / 100;
  return `${currency} ${major.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Splits a gross amount into platform commission and seller payable.
 * Guarantees commissionMinor + sellerPayableMinor === amountMinor.
 * Rounding goes to the platform, never creating or destroying money.
 */
export function splitCommission(
  amountMinor: number,
  commissionPercent: number
): { commissionMinor: number; sellerPayableMinor: number } {
  assertIntegerMinor(amountMinor);
  if (!Number.isInteger(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error(`commissionPercent must be an integer 0-100, received ${commissionPercent}`);
  }

  const commissionMinor = Math.round((amountMinor * commissionPercent) / 100);
  const sellerPayableMinor = amountMinor - commissionMinor;

  if (commissionMinor + sellerPayableMinor !== amountMinor) {
    throw new Error('Commission split invariant violated');
  }

  return { commissionMinor, sellerPayableMinor };
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => {
    assertIntegerMinor(value);
    return total + value;
  }, 0);
}

/** refundable = paid - already refunded (never negative) */
export function remainingRefundableMinor(amountMinor: number, refundedMinor: number): number {
  return Math.max(0, amountMinor - refundedMinor);
}
