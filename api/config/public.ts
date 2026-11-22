import type { VercelRequest, VercelResponse } from '@vercel/node';
import { route, sendJson } from '../../lib/server/utils/http';
import { gatewayCatalogue } from '../../lib/server/payments/registry';
import { env } from '../../lib/server/config/env';

export default route(async (_req: VercelRequest, res: VercelResponse) => {
  let paymentsEnabled = false;
  let commissionPercent = 40;
  let environment: 'sandbox' | 'production' = 'sandbox';

  try {
    const config = env();
    paymentsEnabled = config.PAYMENTS_ENABLED;
    commissionPercent = config.PLATFORM_COMMISSION_PERCENT;
    environment = config.FASTPAY_ENVIRONMENT;
  } catch {
    paymentsEnabled = false;
  }

  sendJson(
    res,
    200,
    {
      data: {
        currency: 'PKR',
        commissionPercent,
        paymentsEnabled,
        environment,
        gateways: gatewayCatalogue()
      }
    },
    'public, s-maxage=300, stale-while-revalidate=600'
  );
});
