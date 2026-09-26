import { CashHandover, Expense, Order, Payment, PaymentMethod, Staff } from '../types';
import { addDaysStr, toDateStr } from './dates';
import { isCashMethod, normalizePaymentMethod } from './payments';

export type Period = 'day' | 'week' | 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * The window a period covers, ending on `reference`.
 *
 * Week and month are trailing windows (the last 7 days, the calendar month
 * containing the reference day) rather than anything clever — the owner asked
 * for "how are we doing", and a trailing window answers that without needing to
 * explain week-start conventions.
 */
export function periodRange(period: Period, reference: string): DateRange {
  if (period === 'day') {
    return { start: reference, end: reference, label: 'this day' };
  }
  if (period === 'week') {
    return { start: addDaysStr(reference, -6), end: reference, label: 'last 7 days' };
  }
  const [y, m] = reference.split('-').map(Number);
  const start = toDateStr(new Date(y, m - 1, 1));
  const end = toDateStr(new Date(y, m, 0));
  return { start, end, label: `${MONTHS[m - 1]} ${y}` };
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export interface SalesSummary {
  /** Deliveries actually completed — this is the money earned. */
  revenue: number;
  deliveredCount: number;
  /** Still open (new/preparing/out): expected but not yet earned. */
  pending: number;
  pendingCount: number;
  /**
   * Money actually received in this window, from the payment records.
   *
   * Deliberately not "delivered orders marked paid": a monthly customer's
   * deliveries are never individually paid, so that would have shown their food
   * as permanently unpaid. What is owed now lives on their account instead.
   */
  received: number;
  /** Delivered revenue split by how the customer pays. */
  byPayment: Record<PaymentMethod, number>;
  expenses: number;
  expensesByCategory: { category: string; amount: number }[];
  profit: number;
  cancelledCount: number;
}

/**
 * Sales and profit for a window.
 *
 * Revenue deliberately counts only delivered orders. Counting orders that are
 * still being cooked would inflate takings, and cancelled or skipped days are
 * excluded entirely so a subscriber who was away is never charged.
 */
export function salesSummary(
  orders: Order[],
  expenses: Expense[],
  range: DateRange,
  payments: Payment[] = []
): SalesSummary {
  const inWindow = orders.filter((o) => inRange(o.date, range));
  const delivered = inWindow.filter((o) => o.status === 'delivered');
  const pending = inWindow.filter(
    (o) => o.status === 'new' || o.status === 'preparing' || o.status === 'out'
  );

  const byPayment: Record<PaymentMethod, number> = { cash: 0, upi: 0, transfer: 0 };
  for (const o of delivered) byPayment[normalizePaymentMethod(o.payment)] += o.total;

  const revenue = delivered.reduce((sum, o) => sum + o.total, 0);
  const received = payments
    .filter((p) => inRange(p.date, range))
    .reduce((sum, p) => sum + p.amount, 0);

  const expensesInWindow = expenses.filter((e) => inRange(e.date, range));
  const expenseTotal = expensesInWindow.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const e of expensesInWindow) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }

  return {
    revenue,
    deliveredCount: delivered.length,
    pending: pending.reduce((sum, o) => sum + o.total, 0),
    pendingCount: pending.length,
    received,
    byPayment,
    expenses: expenseTotal,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    profit: revenue - expenseTotal,
    cancelledCount: inWindow.filter((o) => o.status === 'cancelled').length,
  };
}

export interface RiderCash {
  riderId: string;
  riderName: string;
  deliveries: number;
  /** Cash the rider took in: delivered COD orders marked as collected. */
  collected: number;
  handedOver: number;
  outstanding: number;
  /** Delivered COD orders where no cash was collected — chase the customer. */
  uncollected: number;
}

/**
 * Cash position per rider for one day.
 *
 * Only cash-on-delivery counts: a UPI transfer or a monthly-billed delivery
 * never puts notes in a rider's pocket, so including them would invent a
 * shortfall that does not exist.
 *
 * Cash is attributed to whoever actually marked the delivery done, falling back
 * to the rider it was assigned to — if dispatch reassigns mid-round, the cash
 * should follow the person who took it.
 */
export function riderCashForDate(
  orders: Order[],
  handovers: CashHandover[],
  staff: Staff[],
  date: string
): RiderCash[] {
  const riders = staff.filter((s) => s.role === 'rider');
  const dayOrders = orders.filter((o) => o.date === date && o.status === 'delivered');
  const dayHandovers = handovers.filter((h) => h.date === date);

  const rows = riders.map((rider) => {
    const theirs = dayOrders.filter((o) => (o.deliveredBy ?? o.riderId) === rider.id);
    const cod = theirs.filter((o) => isCashMethod(o.payment));
    const collected = cod.filter((o) => o.paid).reduce((sum, o) => sum + o.total, 0);
    const uncollected = cod.filter((o) => !o.paid).reduce((sum, o) => sum + o.total, 0);
    const handedOver = dayHandovers
      .filter((h) => h.riderId === rider.id)
      .reduce((sum, h) => sum + h.amount, 0);
    return {
      riderId: rider.id,
      riderName: rider.name,
      deliveries: theirs.length,
      collected,
      handedOver,
      outstanding: collected - handedOver,
      uncollected,
    };
  });

  // Riders with nothing to show for the day would only be noise.
  return rows.filter((r) => r.deliveries > 0 || r.handedOver !== 0);
}

// Who owes what now lives in billing.ts, which works from customer accounts
// (charges less payments) rather than a per-delivery paid flag. That flag could
// never describe a monthly customer, whose deliveries are billed as a period.
