/**
 * Grants the ADMIN role to an existing account.
 *
 *   node scripts/make-admin.mjs you@example.com
 *
 * Requires the same Firebase environment variables as the API.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

if (existsSync('.env.local')) {
  const content = readFileSync('.env.local', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (rawValue ?? '').replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.mjs <email>');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseURL = process.env.FIREBASE_DATABASE_URL;
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
const user = await getAuth(app).getUserByEmail(email);
const db = getDatabase(app);

await db.ref(`users/${user.uid}`).update({ role: 'ADMIN', updatedAt: Date.now() });
console.log(`${email} is now an administrator (uid ${user.uid})`);
process.exit(0);
