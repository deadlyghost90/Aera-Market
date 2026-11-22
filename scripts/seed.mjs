/**
 * Development seed: default categories, an admin and an approved author.
 *
 *   node scripts/seed.mjs
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
    const [, key, raw] = match;
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = (raw ?? '').replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
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
        const parsed = JSON.parse(
          Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
        );
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

const CATEGORIES = [
  ['source-code', 'Source Code & Projects', ['SOURCE_CODE', 'SOFTWARE_APP', 'API_TOOL'], ['zip', 'rar', 'js', 'ts', 'py', 'php', 'json', 'md'], 500, 50000, 10],
  ['website-templates', 'Website Templates', ['WEBSITE_TEMPLATE', 'UI_KIT'], ['zip', 'html', 'css', 'js', 'png', 'jpg', 'svg'], 300, 30000, 20],
  ['scripts-automation', 'Scripts & Automation', ['SCRIPT_AUTOMATION', 'SOURCE_CODE'], ['zip', 'py', 'js', 'ts', 'sh', 'json', 'yml'], 100, 20000, 30],
  ['plugins-extensions', 'Plugins & Extensions', ['PLUGIN_EXTENSION', 'SOURCE_CODE'], ['zip', 'jar', 'php', 'js', 'json'], 200, 20000, 40],
  ['minecraft', 'Minecraft Resources', ['MINECRAFT_RESOURCE', 'PLUGIN_EXTENSION', 'GAME_ASSET'], ['zip', 'jar', 'mcpack', 'schem', 'png', 'yml'], 500, 10000, 50],
  ['game-assets', 'Game Development Assets', ['GAME_ASSET', 'GRAPHICS'], ['zip', 'fbx', 'obj', 'glb', 'blend', 'unitypackage', 'png', 'wav'], 1000, 15000, 60],
  ['ui-kits-graphics', 'UI Kits & Graphics', ['UI_KIT', 'GRAPHICS'], ['zip', 'fig', 'sketch', 'psd', 'ai', 'svg', 'png', 'jpg'], 300, 10000, 70],
  ['apis-tools', 'APIs & Developer Tools', ['API_TOOL', 'SOURCE_CODE'], ['zip', 'json', 'yaml', 'js', 'ts', 'py', 'md'], 100, 10000, 80]
];

const now = Date.now();

for (const [slug, name, allowedKinds, allowedExtensions, maxFileMb, minPriceMinor, sort] of CATEGORIES) {
  const id = `cat_${slug}`;
  const exists = await db.ref(`categories/${id}`).get();
  if (exists.exists()) continue;

  await db.ref().update({
    [`categories/${id}`]: {
      id,
      name,
      slug,
      description: `${name} on Aera Market.`,
      allowedKinds,
      allowedExtensions,
      maxFileMb,
      minPriceMinor,
      sort,
      active: true
    },
    [`categorySlugs/${slug}`]: id
  });
  console.log(`category: ${name}`);
}

async function ensureUser(email, password, displayName, role) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    const created = await auth.createUser({ email, password, displayName, emailVerified: true });
    uid = created.uid;
  }

  await db.ref(`users/${uid}`).update({
    uid,
    email,
    displayName,
    role,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  });

  return uid;
}

const adminEmail = process.argv[2] ?? 'admin@aeramarket.test';
const adminUid = await ensureUser(adminEmail, 'AeraMarket123', 'Aera Admin', 'ADMIN');
console.log(`admin: ${adminEmail} (${adminUid})`);

const sellerEmail = 'author@aeramarket.test';
const sellerUid = await ensureUser(sellerEmail, 'AeraMarket123', 'Aera Labs', 'SELLER');

await db.ref(`sellers/${sellerUid}`).set({
  uid: sellerUid,
  displayName: 'Aera Labs',
  bio: 'We build Minecraft tooling, templates and developer utilities. Everything ships with documentation.',
  country: 'PK',
  status: 'APPROVED',
  commissionPercent: 40,
  payoutMethod: null,
  rejectionReason: null,
  createdAt: now,
  updatedAt: now,
  approvedAt: now,
  stats: { products: 0, sales: 0, grossMinor: 0 }
});
console.log(`author: ${sellerEmail} (${sellerUid})`);

process.exit(0);
