/**
 * Development seed: creates a seller account and one published product.
 *
 *   node scripts/seed.mjs
 *
 * Reads .env.local (or the process environment). Never run against production
 * with real customer data.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

function loadEnvFile() {
  if (!existsSync('.env.local')) return;
  const content = readFileSync('.env.local', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;
    let value = rawValue ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n/g, '\n');
  }
}

loadEnvFile();

const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseURL = process.env.FIREBASE_DATABASE_URL;
const email = process.argv[2] ?? 'seller@aeramarket.test';
const password = process.argv[3] ?? 'AeraMarket123';

if (!projectId || !databaseURL) {
  console.error('FIREBASE_PROJECT_ID and FIREBASE_DATABASE_URL are required');
  process.exit(1);
}

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_B64
  ? cert(
      (() => {
        const parsed = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key
        };
      })()
    )
  : cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
    });

const app = initializeApp({ credential, databaseURL });
const auth = getAuth(app);
const db = getDatabase(app);

async function ensureUser() {
  try {
    const existing = await auth.getUserByEmail(email);
    return existing.uid;
  } catch {
    const created = await auth.createUser({ email, password, displayName: 'Demo Seller', emailVerified: true });
    return created.uid;
  }
}

const uid = await ensureUser();
const now = Date.now();

await db.ref(`users/${uid}`).update({
  uid,
  email,
  displayName: 'Demo Seller',
  role: 'SELLER',
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now
});

const productId = 'prod_demo_source_code';
await db.ref(`products/${productId}`).set({
  id: productId,
  sellerId: uid,
  title: 'Minecraft Plugin Starter (demo)',
  slug: productId,
  description:
    'A demonstration listing used to exercise the checkout and payment flow end to end.',
  priceMinor: 100000,
  currency: 'PKR',
  status: 'ACTIVE',
  categoryId: null,
  createdAt: now,
  updatedAt: now
});

console.log(`Seller ready: ${email} (uid ${uid})`);
console.log(`Product ready: ${productId} at PKR 1,000.00`);
process.exit(0);
