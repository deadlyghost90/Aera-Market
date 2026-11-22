import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, sendJson } from '../lib/server/utils/http';

import health from '../lib/api/health';
import configPublic from '../lib/api/config/public';
import authSession from '../lib/api/auth/session';
import authRegister from '../lib/api/auth/register';
import sellersApply from '../lib/api/sellers/apply';
import sellersMe from '../lib/api/sellers/me';
import sellersEarnings from '../lib/api/sellers/me/earnings';
import categoriesIndex from '../lib/api/categories/index';
import productsIndex from '../lib/api/products/index';
import productsMine from '../lib/api/products/mine';
import productById from '../lib/api/products/[id]';
import productSubmit from '../lib/api/products/[id]/submit';
import uploadsPresign from '../lib/api/uploads/presign';
import uploadsComplete from '../lib/api/uploads/complete';
import paymentsIndex from '../lib/api/payments/index';
import paymentsInitiate from '../lib/api/payments/initiate';
import paymentsReturn from '../lib/api/payments/return';
import paymentsWebhook from '../lib/api/payments/webhook';
import paymentStatus from '../lib/api/payments/[id]/status';
import refundsIndex from '../lib/api/refunds/index';
import downloadsAuthorize from '../lib/api/downloads/authorize';
import purchasesIndex from '../lib/api/purchases/index';
import previewById from '../lib/api/previews/[id]';
import adminProducts from '../lib/api/admin/products';
import adminSellers from '../lib/api/admin/sellers';
import adminCategories from '../lib/api/admin/categories';
import adminUsers from '../lib/api/admin/users';
import adminPayments from '../lib/api/admin/payments';
import adminRefundById from '../lib/api/admin/refunds/[id]';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/**
 * Vercel's Hobby plan allows at most 12 serverless functions per deployment, so
 * every route lives behind this single catch-all and is dispatched here. Route
 * handlers themselves are unchanged and stay in lib/api/.
 */
export const config = { api: { bodyParser: false } };

interface Route {
  pattern: string[];
  handler: Handler;
}

/** Most specific patterns first so `products/mine` wins over `products/:id`. */
const ROUTES: Route[] = [
  { pattern: ['health'], handler: health },
  { pattern: ['config', 'public'], handler: configPublic },

  { pattern: ['auth', 'session'], handler: authSession },
  { pattern: ['auth', 'register'], handler: authRegister },

  { pattern: ['sellers', 'apply'], handler: sellersApply },
  { pattern: ['sellers', 'me', 'earnings'], handler: sellersEarnings },
  { pattern: ['sellers', 'me'], handler: sellersMe },

  { pattern: ['categories'], handler: categoriesIndex },

  { pattern: ['products', 'mine'], handler: productsMine },
  { pattern: ['products', ':id', 'submit'], handler: productSubmit },
  { pattern: ['products', ':id'], handler: productById },
  { pattern: ['products'], handler: productsIndex },

  { pattern: ['uploads', 'presign'], handler: uploadsPresign },
  { pattern: ['uploads', 'complete'], handler: uploadsComplete },

  { pattern: ['payments', 'initiate'], handler: paymentsInitiate },
  { pattern: ['payments', 'return'], handler: paymentsReturn },
  { pattern: ['payments', 'webhook'], handler: paymentsWebhook },
  { pattern: ['payments', ':id', 'status'], handler: paymentStatus },
  { pattern: ['payments'], handler: paymentsIndex },

  { pattern: ['refunds'], handler: refundsIndex },
  { pattern: ['downloads', 'authorize'], handler: downloadsAuthorize },
  { pattern: ['purchases'], handler: purchasesIndex },
  { pattern: ['previews', ':id'], handler: previewById },

  { pattern: ['admin', 'products'], handler: adminProducts },
  { pattern: ['admin', 'sellers'], handler: adminSellers },
  { pattern: ['admin', 'categories'], handler: adminCategories },
  { pattern: ['admin', 'users'], handler: adminUsers },
  { pattern: ['admin', 'payments'], handler: adminPayments },
  { pattern: ['admin', 'refunds', ':id'], handler: adminRefundById }
];

/** These two read the raw body themselves to verify signatures. */
const RAW_BODY_ROUTES = new Set(['payments/webhook', 'payments/return']);

function match(pattern: string[], segments: string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;
  const params: Record<string, string> = {};

  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index] as string;
    const actual = segments[index] as string;

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }

  return params;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const rawRoute = req.query.route;
  const segments = (Array.isArray(rawRoute) ? rawRoute : rawRoute ? [rawRoute] : []).filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );

  const key = segments.join('/');

  let matched: { route: Route; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    const params = match(route.pattern, segments);
    if (params) {
      matched = { route, params };
      break;
    }
  }

  if (!matched) {
    sendJson(res, 404, {
      error: { code: 'NOT_FOUND', message: `No API route for /api/${key}` }
    });
    return;
  }

  delete (req.query as Record<string, unknown>).route;
  Object.assign(req.query, matched.params);

  if (!RAW_BODY_ROUTES.has(key)) {
    const contentType = String(req.headers['content-type'] ?? '');
    const raw = await readRawBody(req).catch(() => '');

    if (raw.length > 0) {
      if (contentType.includes('application/json')) {
        try {
          req.body = JSON.parse(raw);
        } catch {
          req.body = undefined;
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        req.body = Object.fromEntries(new URLSearchParams(raw));
      }
    }
  }

  try {
    await matched.route.handler(req, res);
  } catch (error) {
    if (res.headersSent) return;
    sendJson(res, 500, {
      error: {
        code: 'INTERNAL',
        message: error instanceof Error ? error.message : 'Unhandled route error'
      }
    });
  }
}
