/**
 * Turns a Firebase service-account JSON file into the value Vercel needs.
 *
 *   node scripts/validate-service-account.mjs "C:\path\to\key.json"
 *
 * Writes key.base64.txt next to the input file instead of printing the secret,
 * and verifies the fields Firebase actually requires.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-service-account.mjs <path-to-key.json>');
  process.exit(1);
}

let parsed;
try {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  parsed = JSON.parse(raw);
} catch (error) {
  console.error(`Could not read JSON from ${file}: ${error.message}`);
  process.exit(1);
}

const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

const missing = ['project_id', 'client_email', 'private_key'].filter((key) => !parsed[key]);
if (missing.length > 0) {
  console.error(`Not a service-account key. Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const base64 = Buffer.from(readFileSync(file, 'utf8').trim(), 'utf8').toString('base64');
const target = join(dirname(file), 'key.base64.txt');
writeFileSync(target, base64, 'utf8');

console.log('Service account looks correct.');
console.log(`  project_id   : ${parsed.project_id}`);
console.log(`  client_email : ${parsed.client_email}`);
console.log(`  key type     : ${String(parsed.type ?? 'unknown')}`);
console.log(`  base64 length: ${base64.length}`);
console.log('');
console.log(`Base64 written to: ${target}`);
console.log('Copy that file\'s entire contents into FIREBASE_SERVICE_ACCOUNT_B64 in Vercel.');
