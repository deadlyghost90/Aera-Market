/**
 * Deployment preflight. Run before pushing to Vercel:
 *
 *   node scripts/preflight.mjs
 *
 * Reads .env.local when present, otherwise the process environment. It never
 * prints secret values - only whether each one looks usable.
 */
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env.local')) {
  const content = readFileSync('.env.local', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (raw ?? '').replace(/^"|"$/g, '');
  }
}

// Accept the legacy FASTPAY_* names so older deployments keep validating.
for (const key of ['PUBLIC_KEY', 'SECRET_KEY', 'WEBHOOK_SECRET', 'ENVIRONMENT', 'BASE_URL', 'CHECKOUT_URL']) {
  if (!process.env[`SAFEPAY_${key}`] && process.env[`FASTPAY_${key}`]) {
    process.env[`SAFEPAY_${key}`] = process.env[`FASTPAY_${key}`];
  }
}

const results = [];
const add = (name, ok, hint) => results.push({ name, ok, hint });
const value = (key) => (process.env[key] ?? '').trim();

const REQUIRED = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_API_KEY',
  'SAFEPAY_PUBLIC_KEY',
  'SAFEPAY_SECRET_KEY',
  'SAFEPAY_ENVIRONMENT',
  'SAFEPAY_BASE_URL',
  'SAFEPAY_CHECKOUT_URL',
  'APP_ORIGIN',
  'B2_ENDPOINT',
  'B2_REGION',
  'B2_BUCKET_NAME',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY'
];

for (const key of REQUIRED) {
  add(key, value(key).length > 0, 'missing from the environment');
}

// Firebase credentials: base64 service account or the pair of fields.
const b64 = value('FIREBASE_SERVICE_ACCOUNT_B64');
if (b64) {
  try {
    const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const ok = Boolean(parsed.project_id && parsed.client_email && parsed.private_key);
    add('Firebase service account (base64)', ok, 'JSON is missing project_id/client_email/private_key');
  } catch {
    add('Firebase service account (base64)', false, 'not valid base64 JSON');
  }
} else {
  const email = value('FIREBASE_CLIENT_EMAIL');
  const key = value('FIREBASE_PRIVATE_KEY');
  add(
    'Firebase service account (email + key)',
    email.includes('@') && key.includes('BEGIN PRIVATE KEY'),
    'set FIREBASE_SERVICE_ACCOUNT_B64 instead, it is harder to get wrong'
  );
}

const origin = value('APP_ORIGIN');
add('APP_ORIGIN is https', origin.startsWith('https://'), 'Vercel needs an https origin; http breaks the __Host- cookie');
add('APP_ORIGIN has no trailing slash', origin.length > 0 && !origin.endsWith('/'), 'remove the trailing slash');

const env = value('SAFEPAY_ENVIRONMENT');
add('Gateway environment', env === 'sandbox' || env === 'production', 'must be sandbox or production');
add(
  'Gateway base URL matches the environment',
  env === 'production' ? value('SAFEPAY_BASE_URL').includes('api.getsafepay.com') && !value('SAFEPAY_BASE_URL').includes('sandbox') : value('SAFEPAY_BASE_URL').includes('sandbox'),
  'sandbox and production use different hosts'
);

add('B2 endpoint looks like Backblaze', value('B2_ENDPOINT').includes('backblazeb2.com'), 'use the S3 endpoint from the bucket page');
add('B2 bucket name', value('B2_BUCKET_NAME').length > 0, 'usually AeraStorage');
add('Database URL', value('FIREBASE_DATABASE_URL').startsWith('https://'), 'must start with https://');
add(
  'Commission percent',
  value('PLATFORM_COMMISSION_PERCENT') === '' || /^\d{1,3}$/.test(value('PLATFORM_COMMISSION_PERCENT')),
  'must be a whole number 0-100'
);

const failed = results.filter((result) => !result.ok);
const width = Math.max(...results.map((result) => result.name.length));

console.log('');
for (const result of results) {
  const mark = result.ok ? 'OK  ' : 'FAIL';
  const hint = result.ok ? '' : `  <- ${result.hint}`;
  console.log(`${mark}  ${result.name.padEnd(width)}${hint}`);
}
console.log('');

if (failed.length > 0) {
  console.error(`${failed.length} check(s) failed. Fix these before deploying.`);
  process.exit(1);
}

console.log(`All ${results.length} checks passed.`);
