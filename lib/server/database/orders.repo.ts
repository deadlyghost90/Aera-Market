import { db } from '../firebase/admin';
import { PATHS, orderPath } from './paths';
import type { Order } from '../../shared/types';
import type { OrderStatus } from '../../shared/enums';
import { notFound } from '../utils/errors';

function toOrder(value: unknown, id: string): Order | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? (record.items as Order['items']) : [];
  return {
    id,
    buyerId: String(record.buyerId ?? ''),
    items,
    subtotalMinor: Number(record.subtotalMinor ?? 0),
    totalMinor: Number(record.totalMinor ?? 0),
    currency: String(record.currency ?? 'PKR'),
    status: (record.status as OrderStatus) ?? 'PENDING_PAYMENT',
    paymentId: (record.paymentId as string | null) ?? null,
    createdAt: Number(record.createdAt ?? 0),
    updatedAt: Number(record.updatedAt ?? 0)
  };
}

export async function createOrder(order: Order): Promise<Order> {
  const updates: Record<string, unknown> = {
    [orderPath(order.id)]: order,
    [`${PATHS.ordersByBuyer}/${order.buyerId}/${order.id}`]: {
      id: order.id,
      totalMinor: order.totalMinor,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt
    }
  };
  await db().ref().update(updates);
  return order;
}

export async function getOrder(id: string): Promise<Order | null> {
  const snapshot = await db().ref(orderPath(id)).get();
  return toOrder(snapshot.val(), id);
}

export async function requireOrder(id: string): Promise<Order> {
  const order = await getOrder(id);
  if (!order) throw notFound('Order not found');
  return order;
}

export async function setOrderStatus(
  id: string,
  status: OrderStatus,
  patch: Record<string, unknown> = {}
): Promise<void> {
  await db()
    .ref(orderPath(id))
    .update({ status, ...patch, updatedAt: Date.now() });
}

export async function attachPayment(orderId: string, paymentId: string): Promise<void> {
  await db().ref(orderPath(orderId)).update({ paymentId, updatedAt: Date.now() });
}

export async function listOrdersByBuyer(buyerId: string, limit = 50): Promise<Order[]> {
  const snapshot = await db()
    .ref(`${PATHS.ordersByBuyer}/${buyerId}`)
    .limitToLast(limit)
    .get();

  const value = snapshot.val() as Record<string, unknown> | null;
  if (!value) return [];

  const ids = Object.keys(value);
  const orders = await Promise.all(ids.map((id) => getOrder(id)));
  return orders
    .filter((order): order is Order => order !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}
