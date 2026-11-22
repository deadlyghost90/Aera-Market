import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import {
  assertSameOrigin,
  clearCookie,
  parseCookies,
  route,
  sendJson,
  serializeCookie
} from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { createSessionCookie, sessionCookieName, sessionTtlSeconds } from '../../lib/server/firebase/session';
import { getUser, createUserRecord } from '../../lib/server/database/users.repo';
import { signInWithPassword } from '../../lib/server/firebase/session';
import { parse } from '../../lib/server/security/validate';
import { checkRateLimit } from '../../lib/server/security/rate-limit';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200)
});

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  const config = env();
  const secure = config.APP_ORIGIN.startsWith('https://');

  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[sessionCookieName()];
    if (!token) {
      sendJson(res, 200, { data: null });
      return;
    }

    try {
      const { getAuthContext } = await import('../../lib/server/firebase/session');
      const context = await getAuthContext(req);
      sendJson(res, 200, {
        data: {
          uid: context.uid,
          email: context.user.email,
          displayName: context.user.displayName,
          role: context.user.role
        }
      });
      return;
    } catch {
      res.setHeader('Set-Cookie', clearCookie(sessionCookieName(), secure));
      sendJson(res, 200, { data: null });
      return;
    }
  }

  if (req.method === 'DELETE') {
    assertSameOrigin(req, config.APP_ORIGIN);
    res.setHeader('Set-Cookie', clearCookie(sessionCookieName(), secure));
    sendJson(res, 200, { data: { signedOut: true } });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, config.APP_ORIGIN);

  const body = parse(loginSchema, req.body);
  await checkRateLimit({
    bucket: 'login',
    identifier: `${ctx.ip}:${body.email}`,
    limit: 8,
    windowSeconds: 900
  });

  const { idToken, localId } = await signInWithPassword(body.email, body.password);

  const existing = await getUser(localId);
  if (!existing) {
    await createUserRecord({
      uid: localId,
      email: body.email,
      displayName: body.email.split('@')[0] ?? 'Customer',
      role: 'BUYER'
    });
  }

  const cookie = await createSessionCookie(idToken);
  res.setHeader(
    'Set-Cookie',
    serializeCookie(sessionCookieName(), cookie, {
      maxAgeSeconds: sessionTtlSeconds(),
      secure
    })
  );

  const user = existing ?? (await getUser(localId));
  sendJson(res, 200, {
    data: {
      uid: localId,
      email: user?.email ?? body.email,
      displayName: user?.displayName ?? '',
      role: user?.role ?? 'BUYER'
    }
  });
});
