import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { route, sendJson, serializeCookie } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { auth } from '../../server/firebase/admin';
import { getUser } from '../../server/database/users.repo';
import { createUserRecord } from '../../server/database/users.repo';
import {
  createSessionCookie,
  sessionCookieName,
  sessionTtlSeconds
} from '../../server/firebase/session';

/**
 * Verifies a provider's ID token returned by the client-side OAuth flow.
 */
const bodySchema = z.object({
  idToken: z.string().min(1).max(8192),
  provider: z.enum(['google', 'github', 'apple'])
});

export default route(async (req: VercelRequest, res: VercelResponse, _ctx) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  // No origin check needed — this endpoint is called from our own pages after popup redirect
  const { idToken, provider } = bodySchema.parse(req.body);

  let decoded: {
    uid: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
    emailVerified?: boolean;
  };
  try {
    decoded = await auth().verifyIdToken(idToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired credential'), {
      status: 401,
      code: 'UNAUTHORIZED' as const
    });
  }

  const uid = decoded.uid;
  const email = (decoded.email ?? '').toLowerCase();
  const displayName = (decoded.name ?? (email.split('@')[0] ?? '')).trim();

  // Create or confirm user record
  const existing = await getUser(uid);
  if (!existing) {
    await createUserRecord({
      uid,
      email,
      displayName,
      role: 'BUYER'
    });
  }

  // Sign in
  const cookie = await createSessionCookie(idToken);
  res.setHeader(
    'Set-Cookie',
    serializeCookie(sessionCookieName(), cookie, {
      maxAgeSeconds: sessionTtlSeconds(),
      secure: config.APP_ORIGIN.startsWith('https://')
    })
  );

  sendJson(res, 200, {
    data: {
      uid,
      email,
      displayName,
      role: 'BUYER'
    }
  });
});
