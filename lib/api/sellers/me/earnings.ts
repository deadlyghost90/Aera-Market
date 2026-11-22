import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../../server/utils/http';
import { requireUser } from '../../../server/firebase/guards';
import { getSeller } from '../../../server/database/sellers.repo';
import { getSellerBalance, listLedgerBySeller } from '../../../server/database/ledger.repo';
import { forbidden } from '../../../server/utils/errors';

/**
 * What the author has earned, straight from the ledger. The balance is the
 * materialised view; the entries are the evidence behind it.
 */
export default route(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireUser(req);

  const seller = await getSeller(auth.uid);
  if (!seller) throw forbidden('Apply as an author first');

  const [balance, entries] = await Promise.all([
    getSellerBalance(auth.uid),
    listLedgerBySeller(auth.uid, 100)
  ]);

  const totals = entries.reduce(
    (acc, entry) => {
      if (entry.type === 'SALE') acc.salesMinor += entry.amountMinor;
      if (entry.type === 'COMMISSION') acc.commissionMinor += Math.abs(entry.amountMinor);
      if (entry.type === 'REFUND') acc.refundsMinor += Math.abs(entry.amountMinor);
      return acc;
    },
    { salesMinor: 0, commissionMinor: 0, refundsMinor: 0 }
  );

  sendJson(res, 200, {
    data: {
      commissionPercent: seller.commissionPercent,
      status: seller.status,
      balance: balance ?? {
        sellerId: auth.uid,
        availableMinor: 0,
        pendingMinor: 0,
        lifetimeMinor: 0,
        currency: 'PKR',
        updatedAt: 0
      },
      totals,
      entries: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        orderId: entry.orderId,
        paymentId: entry.paymentId,
        createdAt: entry.createdAt
      }))
    }
  });
});
