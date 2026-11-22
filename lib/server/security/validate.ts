import { z, type ZodType } from 'zod';
import { AppError } from '../utils/errors';

/** Validates an untrusted payload and rejects unknown fields. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || 'body';
    throw new AppError('BAD_REQUEST', `Invalid ${path}: ${first?.message ?? 'invalid value'}`);
  }
  return result.data;
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);

export const moneyMinorSchema = z.number().int().nonnegative().max(100_000_000);
