import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { env } from '../config/env';

let app: App | null = null;

/**
 * Minimal structural view of the Realtime Database handle this project uses.
 *
 * firebase-admin's own `Database` interface extends `FirebaseDatabase` from
 * `@firebase/database-types`; that package ships no `main`/`types` field, and
 * under Vercel's per-function TypeScript pass the base type collapses to an
 * empty interface - silently deleting `.ref()` from the SDK's type. Declaring
 * the surface locally keeps the same runtime behaviour and keeps type checking
 * identical on every toolchain.
 */
export interface DbSnapshot {
  val(): unknown;
}

export interface DbTransactionResult {
  committed: boolean;
  snapshot: DbSnapshot;
}

export interface DbQuery {
  get(): Promise<DbSnapshot>;
  orderByChild(path: string): DbQuery;
  equalTo(value: unknown): DbQuery;
  limitToFirst(limit: number): DbQuery;
  limitToLast(limit: number): DbQuery;
}

export interface DbRef extends DbQuery {
  set(value: unknown): Promise<void>;
  update(value: Record<string, unknown>): Promise<void>;
  remove(): Promise<void>;
  transaction(handler: (current: unknown) => unknown): Promise<DbTransactionResult>;
}

export interface DbRoot {
  ref(path?: string): DbRef;
}

function describeValue(raw: string): string {
  const trimmed = raw.trim();
  const first = trimmed[0] ?? '';
  const kind =
    first === '{'
      ? 'raw-json'
      : first === '"'
        ? 'quoted-string'
        : /^[A-Za-z0-9+/=\s]+$/.test(trimmed)
          ? 'base64-ish'
          : 'other';

  let decodedFirst = 'n/a';
  try {
    decodedFirst = JSON.stringify(Buffer.from(trimmed, 'base64').toString('utf8').trim().slice(0, 1));
  } catch {
    decodedFirst = 'decode-failed';
  }

  return [
    `length=${raw.length}`,
    `kind=${kind}`,
    `hasKeyField=${trimmed.includes('"private_key"') || trimmed.includes('"client_email"')}`,
    `newlines=${(raw.match(/\n/g) ?? []).length}`,
    `decodedFirst=${decodedFirst}`
  ].join(', ');
}

function parseServiceAccount(raw: string): {
  project_id: string;
  client_email: string;
  private_key: string;
} {
  const trimmed = raw.trim().replace(/^"|"$/g, '');

  // Accept the raw JSON as well as base64: pasting the key file contents
  // directly is the most common mistake, and failing here produces a confusing
  // "Unexpected token" error at request time.
  const candidates: string[] = [];
  if (trimmed.startsWith('{')) candidates.push(trimmed);
  else {
    candidates.push(Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8'));
    candidates.push(trimmed);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, '\n')
        };
      }
    } catch {
      // try the next candidate
    }
  }

  throw new Error(
    `FIREBASE_SERVICE_ACCOUNT_B64 is not usable (${describeValue(raw)}). ` +
      'Paste the base64 of the service-account JSON, or the JSON object itself.'
  );
}

function buildCredential() {
  const config = env();

  if (config.FIREBASE_SERVICE_ACCOUNT_B64 && config.FIREBASE_SERVICE_ACCOUNT_B64.length > 0) {
    const parsed = parseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_B64);
    return cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key
    });
  }

  return cert({
    projectId: config.FIREBASE_PROJECT_ID,
    clientEmail: config.FIREBASE_CLIENT_EMAIL as string,
    privateKey: (config.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, '\n')
  });
}

export function firebaseApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0] as App;
    return app;
  }

  app = initializeApp({
    credential: buildCredential(),
    databaseURL: env().FIREBASE_DATABASE_URL
  });

  return app;
}

export function db(): DbRoot {
  return getDatabase(firebaseApp()) as unknown as DbRoot;
}

export function auth() {
  return getAuth(firebaseApp());
}

/**
 * Diagnostic used by /api/health: proves the service account can mint an OAuth
 * token, separately from whether the database answers.
 */
export async function credentialStatus(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const credential = (firebaseApp().options as { credential?: unknown }).credential as
      | { getAccessToken?: () => Promise<{ access_token?: string }> }
      | undefined;

    if (!credential?.getAccessToken) return { ok: false, error: 'no credential on the app' };

    const token = await credential.getAccessToken();
    return { ok: Boolean(token?.access_token), error: token?.access_token ? null : 'empty token' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' };
  }
}
