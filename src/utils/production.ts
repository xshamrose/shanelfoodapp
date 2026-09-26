import { Order } from '../types';

export interface BoxLine {
  /** Menu item id when it came from the menu, otherwise the name itself. */
  key: string;
  name: string;
  /** How many to cook. */
  qty: number;
  /** Who it is for, so the count can be opened up. */
  entries: { order: Order; qty: number }[];
}

/**
 * How many of each box to cook for a set of deliveries.
 *
 * This is the number the kitchen works from, so cancelled and skipped
 * deliveries are left out — cooking for someone who is away is waste.
 *
 * A customer taking two different boxes appears under both, with the quantity
 * they take of each.
 */
export function productionCounts(orders: Order[]): BoxLine[] {
  const byBox = new Map<string, BoxLine>();

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    for (const line of order.lines) {
      const key = line.menuItemId ?? `custom:${line.name.toLowerCase()}`;
      const existing = byBox.get(key);
      if (existing) {
        existing.qty += line.qty;
        existing.entries.push({ order, qty: line.qty });
      } else {
        byBox.set(key, {
          key,
          name: line.name,
          qty: line.qty,
          entries: [{ order, qty: line.qty }],
        });
      }
    }
  }

  // Biggest batch first — that is what the kitchen starts on.
  return [...byBox.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/** Total boxes to make, across every type. */
export function totalBoxes(lines: BoxLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}
