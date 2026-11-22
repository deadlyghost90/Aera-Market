import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../server/utils/http';
import { env } from '../../server/config/env';
import { requireAdmin } from '../../server/firebase/guards';
import {
  listProductsByStatus,
  listReviewQueue,
  requireProduct,
  setProductStatus
} from '../../server/database/products.repo';
import { bumpSellerStats } from '../../server/database/sellers.repo';
import { statusForDecision } from '../../server/products/review';
import { writeAudit } from '../../server/security/audit';
import { parse, idSchema } from '../../server/security/validate';
import { AppError } from '../../server/utils/errors';
import type { ProductStatus, ReviewDecision } from '../../shared/enums';
import { PRODUCT_STATUS, REJECTION_REASONS } from '../../shared/enums';

const decisionSchema = z.object({
  productId: idSchema,
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'SUSPEND']),
  note: z.string().trim().max(1000).optional(),
  reason: z.enum(REJECTION_REASONS).optional()
});

/** Which product states each admin action may start from. */
const FROM_STATES: Record<string, ProductStatus[]> = {
  APPROVE: ['PENDING_REVIEW', 'SUSPENDED'],
  REJECT: ['PENDING_REVIEW'],
  REQUEST_CHANGES: ['PENDING_REVIEW'],
  SUSPEND: ['APPROVED']
};

export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAdmin(req);

  if (req.method === 'GET') {
    const queueOnly = req.query.queue === '1';
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'PENDING_REVIEW';
    const status = (PRODUCT_STATUS as readonly string[]).includes(statusRaw)
      ? (statusRaw as ProductStatus)
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
  const allowedFrom = FROM_STATES[body.decision] ?? [];

  if (!allowedFrom.includes(product.status)) {
    throw new AppError(
      'CONFLICT',
      `Cannot ${body.decision.toLowerCase()} a product that is ${product.status}`
    );
  }

  const needsReason = body.decision !== 'APPROVE';
  if (needsReason && (!body.note || body.note.length < 20)) {
    throw new AppError('BAD_REQUEST', 'Explain the decision in at least 20 characters');
  }

  const target: ProductStatus =
    body.decision === 'SUSPEND'
      ? 'SUSPENDED'
      : statusForDecision(body.decision as ReviewDecision);

  const baseReview = product.review ?? {
    submittedAt: Date.now(),
    automatedPassed: false,
    checks: [],
    reviewerId: null,
    decidedAt: null,
    decision: null,
    note: null,
    reason: null
  };

  const updated = await setProductStatus(product.id, target, {
    rejectionNote: body.decision === 'APPROVE' ? null : body.note ?? null,
    approvedAt: body.decision === 'APPROVE' ? Date.now() : null,
    review: {
      ...baseReview,
      reviewerId: auth.uid,
      decidedAt: Date.now(),
      decision: body.decision === 'SUSPEND' ? baseReview.decision : (body.decision as ReviewDecision),
      note: body.note ?? null,
      reason: body.reason ?? null
    }
  });

  if (body.decision === 'APPROVE' && product.status !== 'SUSPENDED') {
    await bumpSellerStats(product.sellerId, { products: 1 });
  }

  await writeAudit({
    actorUid: auth.uid,
    action: `product.${body.decision.toLowerCase()}`,
    targetType: 'product',
    targetId: product.id,
    meta: {
      sellerId: product.sellerId,
      from: product.status,
      to: target,
      reason: body.reason ?? null
    }
  });

  sendJson(res, 200, { data: updated });
});
