import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../server/utils/http';
import { db } from '../server/firebase/admin';
import { gateway } from '../server/config/env';

const REQUIRED = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_API_KEY',
  'APP_ORIGIN'
] as const;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

/**
 * Deployment diagnostic. Reports configuration *names* that are missing (never
 * values), the runtime region, and whether the database answers within 4s.
 * Safe to expose: it reveals nothing an attacker could use.
 */
export default route(async (_req: VercelRequest, res: VercelResponse) => {
  const missing: string[] = REQUIRED.filter((key) => !process.env[key]);

  const hasServiceAccount =
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64) ||
    (Boolean(process.env.FIREBASE_CLIENT_EMAIL) && Boolean(process.env.FIREBASE_PRIVATE_KEY));

  if (!hasServiceAccount) {
    missing.push('FIREBASE_SERVICE_ACCOUNT_B64 (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)');
  }

  const storageMissing = [
    'B2_ENDPOINT',
    'B2_REGION',
    'B2_BUCKET_NAME',
    'B2_KEY_ID',
    'B2_APPLICATION_KEY'
  ].filter((key) => !process.env[key]);

  let gatewayOk = true;
  let gatewayError: string | null = null;
  let gatewayEnvironment = 'unset';

  try {
    const settings = gateway();
    gatewayEnvironment = settings.environment;
  } catch (error) {
    gatewayOk = false;
    gatewayError = error instanceof Error ? error.message : 'gateway not configured';
  }

  const database: { ok: boolean; latencyMs: number; error: string | null } = {
    ok: false,
    latencyMs: -1,
    error: null
  };

  if (missing.length === 0) {
    const started = Date.now();
    try {
      await withTimeout(db().ref('meta/health').get(), 4000, 'database read');
      database.ok = true;
      database.latencyMs = Date.now() - started;
    } catch (error) {
      database.error = error instanceof Error ? error.message : 'unknown database error';
    }
  }

  const healthy = missing.length === 0 && database.ok && gatewayOk;

  sendJson(res, healthy ? 200 : 503, {
    status: healthy ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? 'local',
    deployment: process.env.VERCEL_URL ?? null,
    config: {
      missing,
      serviceAccount: hasServiceAccount,
      gateway: {
        configured: gatewayOk,
        environment: gatewayEnvironment,
        error: gatewayError,
        usingLegacyNames: Boolean(
          process.env.FASTPAY_PUBLIC_KEY && !process.env.SAFEPAY_PUBLIC_KEY
        )
      },
      storageConfigured: storageMissing.length === 0,
      storageMissing
    },
    database
  });
});
