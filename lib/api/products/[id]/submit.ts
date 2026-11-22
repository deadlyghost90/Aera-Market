import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertSameOrigin, route, sendJson } from '../../../server/utils/http';
import { env } from '../../../server/config/env';
import { requireUser } from '../../../server/firebase/guards';
import { requireProduct, listSellerProducts, setProductStatus } from '../../../server/database/products.repo';
import { requireCategory } from '../../../server/database/categories.repo';
import { automatedPassed, blockingFailures, runAutomatedChecks } from '../../../server/products/review';
import { writeAudit } from '../../../server/security/audit';
import { AppError } from '../../../server/utils/errors';
import type { ReviewRecord } from '../../../shared/types';

export default route(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const auth = await requireUser(req);

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) throw new AppError('BAD_REQUEST', 'Product id is required');

  const product = await requireProduct(id);
  if (product.sellerId !== auth.uid) throw new AppError('FORBIDDEN', 'Not your product');
  if (product.status !== 'DRAFT' && product.status !== 'CHANGES_REQUESTED') {
    throw new AppError('CONFLICT', `A ${product.status} product cannot be submitted`);
  }

  const category = await requireCategory(product.categoryId);

  const siblings = await listSellerProducts(auth.uid, 200);
  const duplicateTitle = siblings.some(
    (item) =>
      item.id !== product.id &&
      item.title.trim().toLowerCase() === product.title.trim().toLowerCase() &&
      (item.status === 'PENDING_REVIEW' || item.status === 'APPROVED')
  );

  const checks = runAutomatedChecks(product, category, { duplicateTitle });
  const blocking = blockingFailures(checks);

  if (blocking.length > 0) {
    sendJson(res, 422, {
      error: {
        code: 'CHECKS_FAILED',
        message: 'Fix the blocking issues before submitting for review',
        requestId: ''
      },
      data: { checks, blocking }
    });
    return;
  }

  const review: ReviewRecord = {
    submittedAt: Date.now(),
    automatedPassed: automatedPassed(checks),
    checks,
    reviewerId: null,
    decidedAt: null,
    decision: null,
    note: null,
    reason: null
  };

  const updated = await setProductStatus(product.id, 'PENDING_REVIEW', {
    review,
    rejectionNote: null
  });

  await writeAudit({
    actorUid: auth.uid,
    action: 'product.submitted',
    targetType: 'product',
    targetId: product.id,
    meta: { automaticPass: review.automatedPassed, warnings: checks.filter((c) => !c.passed).length }
  });

  sendJson(res, 200, { data: { product: updated, checks, blocking: [] } });
});
