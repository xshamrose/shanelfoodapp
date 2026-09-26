import { TagTone } from '../components/ui';
import { Order, OrderLine, OrderStatus } from '../types';

export function linesSummary(lines: OrderLine[]): string {
  return lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
}

export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export const STATUS_TONES: Record<OrderStatus, TagTone> = {
  new: 'info',
  preparing: 'warning',
  out: 'primary',
  delivered: 'success',
  cancelled: 'muted',
};

/** Sort for list display: active statuses first, then delivered, then cancelled. */
const STATUS_ORDER: Record<OrderStatus, number> = {
  new: 0,
  preparing: 1,
  out: 2,
  delivered: 3,
  cancelled: 4,
};

export function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.createdAt.localeCompare(b.createdAt)
  );
}
