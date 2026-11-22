import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { AppError, isAppError } from './errors';
import { logger } from './logger';

export interface RequestContext {
  requestId: string;
  ip: string;
}

type Handler = (
  req: VercelRequest,
  res: VercelResponse,
  ctx: RequestContext
) => Promise<void> | void;

const SAFE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
} as const;

export function sendJson(
  res: VercelResponse,
  status: number,
  payload: unknown,
  cacheControl: string = 'no-store'
): void {
  for (const [key, value] of Object.entries(SAFE_HEADERS)) {
    res.setHeader(key, value);
  }
  res.setHeader('Cache-Control', cacheControl);
  res.status(status).json(payload);
}

export function sendError(res: VercelResponse, error: unknown, requestId: string): void {
  if (isAppError(error)) {
    logger.warn('request_failed', { requestId, code: error.code, status: error.status });
    sendJson(res, error.status, {
      error: { code: error.code, message: error.message, requestId }
    });
    return;
  }

  logger.error('request_crashed', {
    requestId,
    message: error instanceof Error ? error.message : 'unknown'
  });
  sendJson(res, 500, {
    error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.', requestId }
  });
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, {
    error: { code: 'BAD_REQUEST', message: 'Method not allowed' }
  });
}

/** Wraps a handler with request id, error envelope and no-store headers. */
export function route(handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const ip = clientIp(req);
    try {
      await handler(req, res, { requestId, ip });
    } catch (error) {
      sendError(res, error, requestId);
    }
  };
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw && raw.length > 0) return raw.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * CSRF defence for cookie-authenticated mutations.
 * A cross-site HTML form cannot set a custom header, and a cross-site fetch
 * with one requires a CORS preflight that this API never approves.
 */
export function assertSameOrigin(req: VercelRequest, appOrigin: string): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    if (origin !== appOrigin) {
      throw new AppError('FORBIDDEN', 'Request origin is not allowed');
    }
    return;
  }

  const marker = req.headers['x-requested-with'];
  if (marker === 'aera-market') return;

  throw new AppError('FORBIDDEN', 'Missing origin or request marker');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; secure: boolean }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name: string, secure: boolean): string {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Reads the raw request body as UTF-8 text (requires bodyParser disabled). */
export async function readRawBody(req: VercelRequest, limitBytes = 64 * 1024): Promise<string> {
  // Some deployments pre-parse the body despite the config flag. Recovering it
  // here keeps signature verification working (tracker signatures especially).
  const preParsed = (req as unknown as { body?: unknown }).body;
  if (preParsed !== undefined && preParsed !== null) {
    if (typeof preParsed === 'string') return preParsed;
    if (Buffer.isBuffer(preParsed)) return preParsed.toString('utf8');
    if (typeof preParsed === 'object') return JSON.stringify(preParsed);
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += buffer.length;
    if (total > limitBytes) {
      throw new AppError('BAD_REQUEST', 'Request body too large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}
