import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSameOrigin, route, sendJson } from '../../lib/server/utils/http';
import { env } from '../../lib/server/config/env';
import { requireUser } from '../../lib/server/firebase/guards';
import { createOrder, listOrdersByBuyer } from '../../lib/server/database/orders.repo';
import { requireApprovedProduct } from '../../lib/server/database/products.repo';
import { parse, idSchema } from '../../lib/server/security/validate';
import { newId } from '../../lib/server/utils/ids';
import { writeAudit } from '../../lib/server/security/audit';
import { AppError } from '../../lib/server/utils/errors';
import type { Order, OrderItem } from '../../lib/shared/types';

const createSchema = z.object({
  items: z
    .array(
      z.object({
        productId: idSchema,
        quantity: z.number().int().min(1).max(1).default(1)
      })
    )
    .min(1)
    .max(10)
});

export default route(async (req: VercelRequest, res: VercelResponse, ctx) => {
  const auth = await requireUser(req);

  if (req.method === 'GET') {
    const orders = await listOrdersByBuyer(auth.uid);
    sendJson(res, 200, { data: orders });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
    return;
  }

  assertSameOrigin(req, env().APP_ORIGIN);
  const body = parse(createSchema, req.body);

  const seen = new Set<string>();
  const items: OrderItem[] = [];
  let subtotalMinor = 0;

  for (const line of body.items) {
    if (seen.has(line.productId)) continue;
    seen.add(line.productId);

    const product = await requireApprovedProduct(line.productId);
    if (product.priceMinor <= 0) {
      throw new AppError('CONFLICT', `"${product.title}" has no valid price`);
    }

    items.push({
      productId: product.id,
      productName: product.title,
      sellerId: product.sellerId,
      unitPriceMinor: product.priceMinor,
      quantity: 1
    });
    subtotalMinor += product.priceMinor;
  }

  if (items.length === 0) throw new AppError('BAD_REQUEST', 'Order has no items');

  const now = Date.now();
  const order: Order = {
    id: newId('ord'),
    buyerId: auth.uid,
    items,
    subtotalMinor,
    totalMinor: subtotalMinor,
    currency: 'PKR',
    status: 'PENDING_PAYMENT',
    paymentId: null,
    createdAt: now,
    updatedAt: now
  };

  await createOrder(order);

  await writeAudit({
    actorUid: auth.uid,
    action: 'order.created',
    targetType: 'order',
    targetId: order.id,
    meta: { totalMinor: order.totalMinor, itemCount: items.length },
    ipHash: ctx.ip
  });

  sendJson(res, 201, { data: order });
});
