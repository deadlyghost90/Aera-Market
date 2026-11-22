import type { VercelRequest } from '@vercel/node';
import { auth } from './admin';
import { env } from '../config/env';
import { AppError, unauthorized } from '../utils/errors';
import { parseCookies } from '../utils/http';
import type { UserRecord } from '../../shared/types';
import { getUser } from '../database/users.repo';

export interface AuthContext {
  uid: string;
  user: UserRecord;
}

/**
 * Signs a user in against Firebase Identity Toolkit (server side), so the
 * browser never needs a Firebase SDK and never stores an ID token itself.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ idToken: string; localId: string }> {
  const config = env();
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
    config.FIREBASE_API_KEY
  )}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(10_000)
  }).catch(() => {
    throw new AppError('GATEWAY_ERROR', 'Authentication service is temporarily unavailable');
  });

  if (!response.ok) {
    // Deliberately generic: never reveal whether the address exists.
    throw unauthorized('Invalid email or password');
  }

  const payload = (await response.json()) as { idToken?: string; localId?: string };
  if (!payload.idToken || !payload.localId) {
    throw unauthorized('Invalid email or password');
  }

  return { idToken: payload.idToken, localId: payload.localId };
}

export async function createSessionCookie(idToken: string): Promise<string> {
  const config = env();
  const expiresIn = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return auth().createSessionCookie(idToken, { expiresIn });
}

export function sessionCookieName(): string {
  return env().SESSION_COOKIE_NAME;
}

export function sessionTtlSeconds(): number {
  return env().SESSION_TTL_DAYS * 24 * 60 * 60;
}

/** Reads and verifies the session cookie, then loads the authoritative user record. */
export async function getAuthContext(req: VercelRequest): Promise<AuthContext> {
  const config = env();
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[config.SESSION_COOKIE_NAME];

  if (!value) throw unauthorized();

  let uid: string;
  try {
    const decoded = await auth().verifySessionCookie(value, true);
    uid = decoded.uid;
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }

  const user = await getUser(uid);
  if (!user) throw unauthorized('Account not found');
  if (user.status !== 'ACTIVE') {
    throw new AppError('FORBIDDEN', 'This account is not active');
  }

  return { uid, user };
}
