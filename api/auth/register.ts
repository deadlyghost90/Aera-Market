import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import {
  assertSameOrigin,
  route,
  sendJson,
  serializeCookie
} from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { auth } from '../../lib/server/firebase/admin';
import {
  createSessionCookie,
  sessionCookieName,
  sessionTtlSeconds,
  signInWithPassword
} from '../../lib/server/firebase/session';
import { createUserRecord } from '../../lib/server/database/users.repo';
import { parse, emailSchema, passwordSchema } from '../../lib/server/security/validate';
import { checkRateLimit } from '../../lib/server/security/rate-limit';
import { AppError } from '../../lib/server/utils/errors';

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60)
});

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  const config = env();
  assertSameOrigin(req, config.APP_ORIGIN);

  await checkRateLimit({
    bucket: 'register',
    identifier: ctx.ip,
    limit: 5,
    windowSeconds: 3600
  });

  const body = parse(registerSchema, req.body);

  let uid: string;
  try {
    const created = await auth().createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      emailVerified: false
    });
    uid = created.uid;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      throw new AppError('CONFLICT', 'An account with this email already exists');
    }
    throw new AppError('BAD_REQUEST', 'Could not create the account');
  }

  await createUserRecord({ uid, email: body.email, displayName: body.displayName, role: 'BUYER' });

  // Sign in immediately so the customer is not asked for the password twice.
  const { idToken } = await signInWithPassword(body.email, body.password);
  const cookie = await createSessionCookie(idToken);

  res.setHeader(
    'Set-Cookie',
    serializeCookie(sessionCookieName(), cookie, {
      maxAgeSeconds: sessionTtlSeconds(),
      secure: config.APP_ORIGIN.startsWith('https://')
    })
  );

  sendJson(res, 201, {
    data: { uid, email: body.email, displayName: body.displayName, role: 'BUYER' }
  });
});
