import { periodRange, riderCashForDate, salesSummary } from './accounts';
import type { CashHandover, Expense, Order, Payment, Staff } from '../types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

const D = '2026-07-29';
const PREV = '2026-07-28';

const order = (o: Partial<Order> & Pick<Order, 'id' | 'total' | 'status' | 'payment' | 'paid'>): Order => ({
  customerId: 'custA',
  lines: [{ name: 'Item', price: o.total, qty: 1 }],
  date: D,
  source: 'manual',
  createdAt: '2026-07-29T00:00:00.000Z',
  ...o,
});

const orders: Order[] = [
  order({ id: '1', total: 290, status: 'delivered', payment: 'cash', paid: true, riderId: 'r1', deliveredBy: 'r1' }),
  order({ id: '2', total: 180, status: 'delivered', payment: 'cash', paid: true, deliveredBy: 'r1' }),
  order({ id: '3', total: 100, status: 'delivered', payment: 'cash', paid: false, riderId: 'r1', deliveredBy: 'r1' }),
  order({ id: '4', total: 200, status: 'delivered', payment: 'upi', paid: true, riderId: 'r2', deliveredBy: 'r2' }),
  order({ id: '5', total: 120, status: 'delivered', payment: 'transfer', paid: false, riderId: 'r1', deliveredBy: 'r1' }),
  order({ id: '6', total: 50, status: 'new', payment: 'cash', paid: false }),
  order({ id: '7', total: 999, status: 'cancelled', payment: 'cash', paid: false }),
  order({ id: '8', total: 60, status: 'delivered', payment: 'cash', paid: true, date: PREV, deliveredBy: 'r1' }),
  order({ id: '9', total: 75, status: 'delivered', payment: 'upi', paid: false, date: PREV, customerId: 'custB' }),
];

const expenses: Expense[] = [
  { id: 'e1', date: D, category: 'Ingredients', amount: 300, createdAt: '' },
  { id: 'e2', date: D, category: 'Gas & fuel', amount: 100, createdAt: '' },
  { id: 'e3', date: PREV, category: 'Rent', amount: 500, createdAt: '' },
];

const handovers: CashHandover[] = [
  { id: 'h1', riderId: 'r1', date: D, amount: 400, receivedBy: 'acc1', createdAt: '' },
];

const staff: Staff[] = [
  { id: 'r1', name: 'Rider One', role: 'rider', pin: '1111', active: true },
  { id: 'r2', name: 'Rider Two', role: 'rider', pin: '2222', active: true },
  { id: 'r3', name: 'Rider Three', role: 'rider', pin: '3333', active: true },
  { id: 'acc1', name: 'Accounts', role: 'accountant', pin: '4444', active: true },
];

console.log('--- salesSummary for one day ---');
const day = periodRange('day', D);
check('day range', day, { start: D, end: D, label: 'this day' });

const s = salesSummary(orders, expenses, day);
// Delivered on 29th: 290 + 180 + 100 + 200 + 120 = 890
check('revenue = delivered only', s.revenue, 890);
check('deliveredCount', s.deliveredCount, 5);
// Still open: order 6 only
check('pending value', s.pending, 50);
check('pendingCount', s.pendingCount, 1);
// Money received is now taken from payment records, not a per-delivery flag —
// a monthly customer's food is never individually "paid".
check('received with no payment records', s.received, 0);
check('byPayment.cash', s.byPayment.cash, 570);
check('byPayment.upi', s.byPayment.upi, 200);
check('byPayment.transfer', s.byPayment.transfer, 120);
check('cancelled excluded from revenue', s.cancelledCount, 1);
// Expenses on the 29th only: 300 + 100 (the 500 rent is the 28th)
check('expenses in window', s.expenses, 400);
check('profit = revenue - expenses', s.profit, 490);
check('expensesByCategory sorted desc', s.expensesByCategory, [
  { category: 'Ingredients', amount: 300 },
  { category: 'Gas & fuel', amount: 100 },
]);

console.log('\n--- month window picks up both days ---');
const month = periodRange('month', D);
check('month range', month, { start: '2026-07-01', end: '2026-07-31', label: 'July 2026' });
const m = salesSummary(orders, expenses, month);
// adds the 28th: 60 (cod paid) + 75 (upi unpaid) = 135 more
check('month revenue', m.revenue, 890 + 135);
check('month expenses', m.expenses, 900);
check('month profit', m.profit, 1025 - 900);

console.log('\n--- week window is trailing 7 days ---');
check('week range', periodRange('week', D), {
  start: '2026-07-23',
  end: D,
  label: 'last 7 days',
});

console.log('\n--- rider cash reconciliation ---');
const cash = riderCashForDate(orders, handovers, staff, D);
check('only riders with activity listed', cash.map((c) => c.riderId), ['r1', 'r2']);
const r1 = cash.find((c) => c.riderId === 'r1')!;
check('r1 deliveries (incl. non-cash)', r1.deliveries, 4);
// COD + paid attributed to r1: 290 + 180
check('r1 cash collected', r1.collected, 470);
check('r1 handed over', r1.handedOver, 400);
check('r1 still to hand in', r1.outstanding, 70);
// COD delivered but not collected
check('r1 uncollected from customers', r1.uncollected, 100);
const r2 = cash.find((c) => c.riderId === 'r2')!;
check('r2 upi delivery is not cash', r2.collected, 0);
check('r2 nothing outstanding', r2.outstanding, 0);

console.log('\n--- money received comes from payment records ---');
const paymentRecords: Payment[] = [
  { id: 'pay1', customerId: 'custA', date: D, amount: 470, method: 'cash', createdAt: '' },
  { id: 'pay2', customerId: 'custB', date: PREV, amount: 60, method: 'upi', createdAt: '' },
];
const withPayments = salesSummary(orders, expenses, day, paymentRecords);
check('only payments dated in the window count', withPayments.received, 470);
const monthWithPayments = salesSummary(orders, expenses, month, paymentRecords);
check('the month picks up both', monthWithPayments.received, 530);
check('revenue is unaffected by payments', monthWithPayments.revenue, m.revenue);
check('profit is unaffected by payments', monthWithPayments.profit, m.profit);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
