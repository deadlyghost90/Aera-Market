import { z } from 'zod';

/**
 * Environment access is lazy on purpose: importing a module must never throw
 * during tests or `tsc --noEmit`. The first real API call validates everything
 * and fails closed with a clear message.
 *
 * Gateway variables use SAFEPAY_* names. The older FASTPAY_* names are still
 * accepted so an existing deployment keeps working after the rename.
 */
const optionalString = z.string().optional();

const schema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_DATABASE_URL: z.string().url(),
  FIREBASE_CLIENT_EMAIL: optionalString,
  FIREBASE_PRIVATE_KEY: optionalString,
  FIREBASE_SERVICE_ACCOUNT_B64: optionalString,
  FIREBASE_API_KEY: z.string().min(1),

  SAFEPAY_PUBLIC_KEY: optionalString,
  SAFEPAY_SECRET_KEY: optionalString,
  SAFEPAY_WEBHOOK_SECRET: optionalString,
  SAFEPAY_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  SAFEPAY_BASE_URL: optionalString,
  SAFEPAY_CHECKOUT_URL: optionalString,

  // Legacy names, kept for backwards compatibility.
  FASTPAY_PUBLIC_KEY: optionalString,
  FASTPAY_SECRET_KEY: optionalString,
  FASTPAY_WEBHOOK_SECRET: optionalString,
  FASTPAY_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  FASTPAY_BASE_URL: optionalString,
  FASTPAY_CHECKOUT_URL: optionalString,

  APP_ORIGIN: z.string().url(),

  B2_ENDPOINT: optionalString,
  B2_REGION: optionalString,
  B2_BUCKET_NAME: optionalString,
  B2_KEY_ID: optionalString,
  B2_APPLICATION_KEY: optionalString,

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

export interface GatewaySettings {
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
  baseUrl: string;
  checkoutUrl: string;
}

/**
 * Resolves the gateway settings, preferring SAFEPAY_* and falling back to the
 * legacy FASTPAY_* names.
 */
export function gateway(): GatewaySettings {
  const config = env();
  const envName = config.SAFEPAY_ENVIRONMENT ?? config.FASTPAY_ENVIRONMENT;
  const publicKey = config.SAFEPAY_PUBLIC_KEY ?? config.FASTPAY_PUBLIC_KEY ?? '';
  const secretKey = config.SAFEPAY_SECRET_KEY ?? config.FASTPAY_SECRET_KEY ?? '';
  const webhook = config.SAFEPAY_WEBHOOK_SECRET ?? config.FASTPAY_WEBHOOK_SECRET ?? '';

  const defaultHost = envName === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com';

  const baseUrl = (config.SAFEPAY_BASE_URL ?? config.FASTPAY_BASE_URL ?? defaultHost).replace(/\/+$/, '');
  const checkoutUrl =
    config.SAFEPAY_CHECKOUT_URL ??
    config.FASTPAY_CHECKOUT_URL ??
    (envName === 'production' ? 'https://www.getsafepay.com/components' : 'https://sandbox.api.getsafepay.com/components');

  const missing: string[] = [];
  if (!publicKey) missing.push('SAFEPAY_PUBLIC_KEY');
  if (!secretKey) missing.push('SAFEPAY_SECRET_KEY');
  if (!envName) missing.push('SAFEPAY_ENVIRONMENT');
  if (missing.length > 0) {
    throw new Error(`Payment gateway is not configured (missing ${missing.join(', ')})`);
  }

  return {
    publicKey,
    secretKey,
    webhookSecret: webhook.length > 0 ? webhook : secretKey,
    environment: envName as 'sandbox' | 'production',
    baseUrl,
    checkoutUrl
  };
}

/** @deprecated use gateway().webhookSecret */
export function webhookSecret(): string {
  return gateway().webhookSecret;
}
