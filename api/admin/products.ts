import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireAdmin } from '../../lib/server/firebase/guards';
import {
  listProductsByStatus,
  listReviewQueue,
  requireProduct,
  setProductStatus
} from '../../lib/server/database/products.repo';
import { bumpSellerStats } from '../../lib/server/database/sellers.repo';
import { statusForDecision } from '../../lib/server/products/review';
import { writeAudit } from '../../lib/server/security/audit';
import { parse, idSchema } from '../../lib/server/security/validate';
import { AppError } from '../../lib/server/utils/errors';
import { PRODUCT_STATUS, REJECTION_REASONS, REVIEW_DECISION } from '../../lib/shared/enums';

const decisionSchema = z.object({
  productId: idSchema,
  decision: z.enum(REVIEW_DECISION),
  note: z.string().trim().max(1000).optional(),
  reason: z.enum(REJECTION_REASONS).optional()
});

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method === 'GET') {
    const queueOnly = req.query.queue === '1';
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'PENDING_REVIEW';
    const status = (PRODUCT_STATUS as readonly string[]).includes(statusRaw)
      ? (statusRaw as (typeof PRODUCT_STATUS)[number])
      : 'PENDING_REVIEW';

    const products = queueOnly ? await listReviewQueue(100) : await listProductsByStatus(status, 100);
    sendJson(res, 200, { data: products });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const body = parse(decisionSchema, req.body);

  const product = await requireProduct(body.productId);
  if (product.status !== 'PENDING_REVIEW') {
    throw new AppError('CONFLICT', `Only products in review can be decided, this one is ${product.status}`);
  }

  if (body.decision !== 'APPROVE' && (!body.note || body.note.length < 20)) {
    throw new AppError('BAD_REQUEST', 'Explain the decision in at least 20 characters');
  }

  const target = statusForDecision(body.decision);

  const updated = await setProductStatus(product.id, target, {
    rejectionNote: body.decision === 'APPROVE' ? null : body.note ?? null,
    approvedAt: body.decision === 'APPROVE' ? Date.now() : null,
    review: {
      ...(product.review ?? {
        submittedAt: Date.now(),
        automatedPassed: false,
        checks: [],
        decision: null,
        note: null,
        reason: null,
        decidedAt: null,
        reviewerId: null
      }),
      reviewerId: auth.uid,
      decidedAt: Date.now(),
      decision: body.decision,
      note: body.note ?? null,
      reason: body.reason ?? null
    }
  });

  if (body.decision === 'APPROVE') {
    await bumpSellerStats(product.sellerId, { products: 1 });
  }

  await writeAudit({
    actorUid: auth.uid,
    action: `product.${body.decision.toLowerCase()}`,
    targetType: 'product',
    targetId: product.id,
    meta: {
      sellerId: product.sellerId,
      reason: body.reason ?? null,
      automatedPassed: product.review?.automatedPassed ?? null
    }
  });

  sendJson(res, 200, { data: updated });
});
