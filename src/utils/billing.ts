import { Bill, BillingCycle, Customer, Order, Payment } from '../types';
import { addDaysStr, addMonthsStr, daysBetween } from './dates';

/**
 * Every customer has a running account: things they have been charged for, less
 * what they have paid. The difference is what they owe.
 *
 * Charges depend on how they settle up:
 *
 *  - **Daily** customers pay per delivery, so each completed delivery is a charge.
 *  - **Weekly / monthly** customers pay against a bill you raise for the period,
 *    at a figure you agree with them. Their deliveries are deliberately *not*
 *    charged one by one, or they would be billed twice for the same food.
 *
 * Payments are recorded as amounts rather than a paid/unpaid flag, which is what
 * makes part payments work: someone can hand over half now and the rest later,
 * and the balance simply follows.
 */

export function cycleOf(customer: Customer | undefined): BillingCycle {
  return customer?.billingCycle ?? 'daily';
}

/** Deliveries that count towards money: completed, and not cancelled or skipped. */
export function chargeableOrders(orders: Order[], customerId: string): Order[] {
  return orders.filter((o) => o.customerId === customerId && o.status === 'delivered');
}

function overlaps(order: Order, bill: Bill): boolean {
  return order.date >= bill.periodStart && order.date <= bill.periodEnd;
}

export interface UninvoicedWork {
  orders: Order[];
  count: number;
  /** What those deliveries would come to at menu prices — a guide, not the bill. */
  suggested: number;
  earliest?: string;
  latest?: string;
}

/**
 * Completed deliveries for a weekly/monthly customer that no bill covers yet.
 *
 * Without this, forgetting to raise a bill would quietly look like the customer
 * owing nothing — the most expensive kind of mistake this app could make.
 */
export function uninvoicedWork(
  orders: Order[],
  bills: Bill[],
  customer: Customer
): UninvoicedWork {
  if (cycleOf(customer) === 'daily') {
    return { orders: [], count: 0, suggested: 0 };
  }
  const theirBills = bills.filter((b) => b.customerId === customer.id);
  const notCovered = chargeableOrders(orders, customer.id).filter(
    (o) => !theirBills.some((b) => overlaps(o, b))
  );
  const dates = notCovered.map((o) => o.date).sort();
  return {
    orders: notCovered,
    count: notCovered.length,
    suggested: notCovered.reduce((sum, o) => sum + o.total, 0),
    earliest: dates[0],
    latest: dates[dates.length - 1],
  };
}

export type AccountStatus = 'settled' | 'owes' | 'credit';

export interface CustomerAccount {
  customerId: string;
  customerName: string;
  cycle: BillingCycle;
  /** Total charged: deliveries for daily customers, bills for the rest. */
  charged: number;
  paid: number;
  /** Positive means they owe you; negative means they are in credit. */
  balance: number;
  status: AccountStatus;
  /** True when they have paid something but not all of it. */
  partlyPaid: boolean;
  uninvoiced: UninvoicedWork;
  lastPaymentDate?: string;
  deliveries: number;
}

export function customerAccount(
  customer: Customer,
  orders: Order[],
  bills: Bill[],
  payments: Payment[]
): CustomerAccount {
  const cycle = cycleOf(customer);
  const delivered = chargeableOrders(orders, customer.id);

  const charged =
    cycle === 'daily'
      ? delivered.reduce((sum, o) => sum + o.total, 0)
      : bills.filter((b) => b.customerId === customer.id).reduce((sum, b) => sum + b.amount, 0);

  const theirPayments = payments.filter((p) => p.customerId === customer.id);
  const paid = theirPayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = charged - paid;

  const paymentDates = theirPayments.map((p) => p.date).sort();

  return {
    customerId: customer.id,
    customerName: customer.name,
    cycle,
    charged,
    paid,
    balance,
    status: balance > 0 ? 'owes' : balance < 0 ? 'credit' : 'settled',
    partlyPaid: paid > 0 && balance > 0,
    uninvoiced: uninvoicedWork(orders, bills, customer),
    lastPaymentDate: paymentDates[paymentDates.length - 1],
    deliveries: delivered.length,
  };
}

/** Every account, worst debt first, so the accountant knows who to chase. */
export function allAccounts(
  customers: Customer[],
  orders: Order[],
  bills: Bill[],
  payments: Payment[]
): CustomerAccount[] {
  return customers
    .map((c) => customerAccount(c, orders, bills, payments))
    .sort((a, b) => b.balance - a.balance || a.customerName.localeCompare(b.customerName));
}

/** Accounts needing attention: money owed, or deliveries waiting to be billed. */
export function accountsNeedingAttention(accounts: CustomerAccount[]): CustomerAccount[] {
  return accounts.filter((a) => a.balance > 0 || a.uninvoiced.count > 0);
}

export function totalOwed(accounts: CustomerAccount[]): number {
  return accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
}

export function totalUninvoiced(accounts: CustomerAccount[]): number {
  return accounts.reduce((sum, a) => sum + a.uninvoiced.suggested, 0);
}

/** Money actually received between two dates. */
export function paymentsInRange(payments: Payment[], start: string, end: string): number {
  return payments
    .filter((p) => p.date >= start && p.date <= end)
    .reduce((sum, p) => sum + p.amount, 0);
}

export interface BillingPeriod {
  start: string;
  end: string;
  /** How the period reads, e.g. "12 Aug – 11 Sep". */
  label: string;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

export function periodLabel(start: string, end: string): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/**
 * The next period to bill this customer for.
 *
 * Customers do not join on the 1st of the month, so calendar months are the
 * wrong unit. Someone who started on the 12th has a month running the 12th to
 * the 11th, and that is what they expect to be charged for.
 *
 * Each period picks up the day after their last bill ended, which is what stops
 * the two mistakes that actually cost money: a gap where a week went unbilled,
 * and an overlap where the same days were charged twice.
 */
export function nextBillingPeriod(
  cycle: BillingCycle,
  customerBills: Bill[],
  anchor: string
): BillingPeriod | null {
  if (cycle === 'daily') return null;

  const previous = customerBills
    .filter((b) => !b.deleted)
    .map((b) => b.periodEnd)
    .sort();
  const lastEnd = previous[previous.length - 1];

  const start = lastEnd ? addDaysStr(lastEnd, 1) : anchor;
  const end =
    cycle === 'weekly'
      ? addDaysStr(start, 6)
      : addDaysStr(addMonthsStr(start, 1), -1);

  return { start, end, label: periodLabel(start, end) };
}

/**
 * Bills that already cover part of this range.
 *
 * Charging the same days twice is the worst mistake this screen could allow,
 * so it is worth checking for explicitly rather than trusting the dates.
 */
export function overlappingBills(
  customerBills: Bill[],
  start: string,
  end: string,
  ignoreBillId?: string
): Bill[] {
  return customerBills.filter(
    (b) =>
      !b.deleted &&
      b.id !== ignoreBillId &&
      b.periodStart <= end &&
      b.periodEnd >= start
  );
}

/** An unbilled stretch between their last bill and the period about to be raised. */
export function gapBeforePeriod(
  customerBills: Bill[],
  start: string
): { from: string; to: string; days: number } | null {
  const ends = customerBills.filter((b) => !b.deleted).map((b) => b.periodEnd).sort();
  const lastEnd = ends[ends.length - 1];
  if (!lastEnd) return null;

  const expected = addDaysStr(lastEnd, 1);
  if (start <= expected) return null;

  return { from: expected, to: addDaysStr(start, -1), days: daysBetween(expected, start) };
}

/** The id a cash collection always produces, so it can never be counted twice. */
export function collectionPaymentId(orderId: string): string {
  return `pay-order-${orderId}`;
}

/** Plain-text statement to paste into WhatsApp or SMS. */
export function accountStatementText(
  account: CustomerAccount,
  bills: Bill[],
  payments: Payment[],
  currency = '₹'
): string {
  const lines: string[] = ['Shanel Foods', `Statement for ${account.customerName}`, ''];

  if (account.cycle === 'daily') {
    lines.push(`Deliveries: ${account.deliveries}`);
    lines.push(`Charged: ${currency}${account.charged}`);
  } else {
    const theirBills = bills
      .filter((b) => b.customerId === account.customerId)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    for (const b of theirBills) {
      lines.push(`${b.periodStart} to ${b.periodEnd}: ${currency}${b.amount}`);
    }
    if (theirBills.length === 0) lines.push('No bills raised yet');
  }

  const theirPayments = payments
    .filter((p) => p.customerId === account.customerId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (theirPayments.length > 0) {
    lines.push('', 'Paid:');
    for (const p of theirPayments) lines.push(`${p.date}: ${currency}${p.amount}`);
  }

  lines.push('');
  if (account.balance > 0) lines.push(`Balance due: ${currency}${account.balance}`);
  else if (account.balance < 0) lines.push(`In credit: ${currency}${Math.abs(account.balance)}`);
  else lines.push('Fully settled — thank you!');

  return lines.join('\n');
}
