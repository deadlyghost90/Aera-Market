/**
 * Static wiring check for the static site.
 *
 * Verifies, for every HTML page:
 *  - every local stylesheet / script / link target exists on disk
 *  - every element id referenced by that page's script exists in the markup
 *  - the shell's navigation targets exist
 *
 * Run with: node scripts/check-pages.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const problems = [];
const notes = [];

// Ids that a shared script looks up defensively (guarded by an if-check) and
// therefore are expected to be absent on some pages.
const OPTIONAL_IDS = new Set(['login-form', 'register-form', 'toast-host']);

const htmlFiles = readdirSync(root).filter((file) => file.endsWith('.html'));

function assetsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
    found.add(match[1]);
  }
  return found;
}

function idsOf(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function scriptRefs(js) {
  const refs = new Set();
  for (const match of js.matchAll(/getElementById\('([^']+)'\)/g)) refs.add(match[1]);
  for (const match of js.matchAll(/\bel\('([^']+)'\)/g)) refs.add(match[1]);
  for (const match of js.matchAll(/querySelector\('#([^']+)'\)/g)) refs.add(match[1]);
  return refs;
}

for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  const ids = idsOf(html);

  for (const asset of assetsOf(html)) {
    if (asset.startsWith('/api/')) continue;
    if (!existsSync(join(root, asset))) {
      problems.push(`${file}: links to missing file ${asset}`);
    }
  }

  for (const match of html.matchAll(/<script[^>]+src="(\/js\/[^"]+)"/g)) {
    const scriptPath = match[1];
    if (!existsSync(join(root, scriptPath))) {
      problems.push(`${file}: script ${scriptPath} does not exist`);
      continue;
    }

    const refs = scriptRefs(readFileSync(join(root, scriptPath), 'utf8'));
    for (const id of refs) {
      if (OPTIONAL_IDS.has(id)) continue;
      if (!ids.has(id)) {
        problems.push(`${file}: ${scriptPath} references missing id #${id}`);
      }
    }
  }
}

// Navigation is generated in one place, so check it once.
const shell = readFileSync(join(root, 'js/core/shell.js'), 'utf8');
for (const match of shell.matchAll(/navLink\('(\/[^']+)'/g)) {
  const target = (match[1] ?? '').split('#')[0].split('?')[0];
  if (!existsSync(join(root, target))) {
    problems.push(`js/core/shell.js: nav target ${target} does not exist`);
  }
}

notes.push(`${htmlFiles.length} pages checked`);

if (problems.length > 0) {
  console.error('Wiring problems:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`OK — ${notes.join(', ')}. Every asset, script, id and nav target resolves.`);
