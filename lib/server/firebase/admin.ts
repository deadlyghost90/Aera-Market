import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { env } from '../config/env';

let app: App | null = null;

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

export function db(): Database {
  return getDatabase(firebaseApp());
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}
