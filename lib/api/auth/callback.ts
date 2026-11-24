import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../../server/config/env';
import { auth } from '../../server/firebase/admin';
import { getUser } from '../../server/database/users.repo';
import { createUserRecord } from '../../server/database/users.repo';
import {
  createSessionCookie,
  sessionCookieName,
  sessionTtlSeconds
} from '../../server/firebase/session';
import { sendJson, serializeCookie } from '../../server/utils/http';

/**
 * Legacy endpoint for OAuth callback. Now redirects callers to /api/auth/federated
 * after extracting the id_token from the query string.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  const secure = config.APP_ORIGIN.startsWith('https://');
  const { id_token, provider } = req.query;

  if (!id_token || typeof id_token !== 'string') {
    res.redirect('/login.html?error=missing_token');
    return;
  }

  try {
    const decoded = await auth().verifyIdToken(id_token);
    const uid = decoded.uid;
    const email = (decoded.email ?? '').toLowerCase();
    const displayName = (decoded.name ?? (email.split('@')[0] ?? '')).trim();

    const existing = await getUser(uid);
    if (!existing) {
      await createUserRecord({ uid, email, displayName, role: 'BUYER' });
    }

    const cookie = await createSessionCookie(id_token);
    res.setHeader('Set-Cookie', serializeCookie(sessionCookieName(), cookie, {
      maxAgeSeconds: sessionTtlSeconds(),
      secure
    }));

    sendJson(res, 200, { data: { message: 'authenticated' } });
  } catch {
    res.redirect('/login.html?error=invalid_token');
  }
}
