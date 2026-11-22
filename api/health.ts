import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../lib/server/utils/http';
import { db } from '../lib/server/firebase/admin';

export default route(async (_req: VercelRequest, res: VercelResponse) => {
  const database = { ok: false, latencyMs: -1 };
  const started = Date.now();

  try {
    await db().ref('.info/connected').get();
    database.ok = true;
    database.latencyMs = Date.now() - started;
  } catch {
    database.ok = false;
  }

  sendJson(res, database.ok ? 200 : 503, {
    status: database.ok ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    database
  });
});
