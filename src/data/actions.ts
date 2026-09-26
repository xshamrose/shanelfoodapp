import { Order } from '../types';
import { collectionPaymentId } from '../utils/billing';
import { isCashMethod } from '../utils/payments';
import { db } from './store';

/**
 * Keep a customer's account in step with cash collected at the door.
 *
 * When a rider collects cash for a delivery that is money received, and it has
 * to reduce what the customer owes. The payment id is derived from the order, so
 * calling this repeatedly can never create a second payment for the same
 * delivery — and if the collection is undone, the payment goes with it.
 *
 * Call this after any change to a delivery's paid flag, status or total.
 */
export async function syncCollectionPayment(order: Order, recordedBy?: string): Promise<void> {
  const id = collectionPaymentId(order.id);
  const existing = db.payments.get(id);
  const shouldExist = isCashMethod(order.payment) && order.paid && order.status === 'delivered';

  if (!shouldExist) {
    if (existing) await db.payments.remove(id);
    return;
  }

  if (!existing) {
    await db.payments.upsert({
      id,
      customerId: order.customerId,
      date: order.date,
      amount: order.total,
      method: 'cash',
      orderId: order.id,
      recordedBy,
      note: 'Cash collected on delivery',
      createdAt: new Date().toISOString(),
    });
    return;
  }

  // The delivery was edited after the cash was collected — follow the new figure.
  if (existing.amount !== order.total || existing.date !== order.date) {
    await db.payments.upsert({ ...existing, amount: order.total, date: order.date });
  }
}

/** Save a delivery and keep its cash-collection payment in step. */
export async function saveOrder(order: Order, actorId?: string): Promise<void> {
  await db.orders.upsert(order);
  await syncCollectionPayment(order, actorId);
}
