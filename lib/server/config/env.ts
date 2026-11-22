import { z } from 'zod';

/**
 * Environment access is lazy on purpose: importing a module must never throw
 * during tests or `tsc --noEmit`. The first real API call validates everything
 * and fails closed with a clear message.
 */
const schema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_DATABASE_URL: z.string().url(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().optional(),
  FIREBASE_API_KEY: z.string().min(1),

  FASTPAY_PUBLIC_KEY: z.string().min(1),
  FASTPAY_SECRET_KEY: z.string().min(1),
  FASTPAY_WEBHOOK_SECRET: z.string().optional(),
  FASTPAY_ENVIRONMENT: z.enum(['sandbox', 'production']),
  FASTPAY_BASE_URL: z.string().url(),
  FASTPAY_CHECKOUT_URL: z.string().url(),

  APP_ORIGIN: z.string().url(),
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().int().min(0).max(100).default(40),
  SESSION_COOKIE_NAME: z.string().default('__Host-aera_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(14).default(5),
  PAYMENTS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true')
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${fields}`);
  }

  if (!parsed.data.FIREBASE_SERVICE_ACCOUNT_B64) {
    if (!parsed.data.FIREBASE_CLIENT_EMAIL || !parsed.data.FIREBASE_PRIVATE_KEY) {
      throw new Error(
        'Firebase credentials missing: set FIREBASE_SERVICE_ACCOUNT_B64 or both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY'
      );
    }
  }

  cached = parsed.data;
  return cached;
}

/** Test-only helper: clears the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}

export function webhookSecret(): string {
  const value = env();
  return value.FASTPAY_WEBHOOK_SECRET && value.FASTPAY_WEBHOOK_SECRET.length > 0
    ? value.FASTPAY_WEBHOOK_SECRET
    : value.FASTPAY_SECRET_KEY;
}
