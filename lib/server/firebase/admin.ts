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

function buildCredential() {
  const config = env();

  if (config.FIREBASE_SERVICE_ACCOUNT_B64 && config.FIREBASE_SERVICE_ACCOUNT_B64.length > 0) {
    const json = Buffer.from(config.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
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
