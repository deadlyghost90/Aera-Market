import { db } from '../firebase/admin';
import { rateLimitPath } from '../database/paths';
import { hashIp } from '../utils/ids';
import { AppError } from '../utils/errors';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window counter in RTDB. Serverless instances are stateless, so the
 * counter must live in shared storage; a transaction keeps it accurate under
 * concurrent requests.
 */
export async function checkRateLimit(input: {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${input.bucket}_${hashIp(input.identifier).slice(0, 16)}_${windowStart}`;
  const ref = db().ref(rateLimitPath(key));

  const result = await ref.transaction((node) => {
    const current = node as { count?: number; resetAt?: number } | null;
    if (!current || !current.resetAt || current.resetAt <= now) {
      return { count: 1, resetAt: windowStart + windowMs };
    }
    if ((current.count ?? 0) >= input.limit) {
      return undefined; // abort: over the limit
    }
    return { count: (current.count ?? 0) + 1, resetAt: current.resetAt };
  });

  const snapshot = result.committed ? result.snapshot.val() : (await ref.get()).val();
  const state = snapshot as { count?: number; resetAt?: number } | null;
  const resetAt = state?.resetAt ?? windowStart + windowMs;

  if (!result.committed) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please slow down and try again.', {
      resetAt
    });
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - (state?.count ?? 1)),
    resetAt
  };
}
