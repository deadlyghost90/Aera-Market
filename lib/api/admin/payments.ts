import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../server/utils/http';
import { requireAdmin } from '../../server/firebase/guards';
import { listRecentPayments } from '../../server/database/payments.repo';
import { listRecentRefunds } from '../../server/database/refunds.repo';
import { computePaymentStats } from '../../server/payments/stats';

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default route(async (req: VercelRequest, res: VercelResponse) => {
  await requireAdmin(req);

  const statusFilter = single(req.query.status)?.toUpperCase();
  const search = single(req.query.q)?.toLowerCase().trim();
  const fromRaw = single(req.query.from);
  const toRaw = single(req.query.to);
  const limit = Math.min(500, Math.max(1, Number(single(req.query.limit) ?? 200) || 200));

  const from = fromRaw ? Date.parse(fromRaw) : null;
  const to = toRaw ? Date.parse(toRaw) : null;

  const [payments, refunds, stats] = await Promise.all([
    listRecentPayments(limit),
    listRecentRefunds(100),
    computePaymentStats(1000)
  ]);

  const filtered = payments.filter((payment) => {
    if (statusFilter && statusFilter !== 'ALL' && payment.status !== statusFilter) return false;
    if (from !== null && Number.isFinite(from) && payment.createdAt < from) return false;
    if (to !== null && Number.isFinite(to) && payment.createdAt > to) return false;
    if (search) {
      const haystack = [
        payment.id,
        payment.orderId,
        payment.userId,
        payment.productName,
        payment.gatewayTrackerId ?? '',
        payment.gatewayReference ?? '',
        payment.gatewayTransactionId ?? ''
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  sendJson(res, 200, {
    data: {
      stats,
      payments: filtered,
      refunds,
      appliedFilters: {
        status: statusFilter ?? 'ALL',
        q: search ?? null,
        from: fromRaw ?? null,
        to: toRaw ?? null,
        limit
      }
    }
  });
});
