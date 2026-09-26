import {
  accountsNeedingAttention,
  allAccounts,
  collectionPaymentId,
  customerAccount,
  paymentsInRange,
  totalOwed,
  totalUninvoiced,
  uninvoicedWork,
} from './billing';
import type { Bill, Customer, Order, Payment } from '../types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

const customer = (id: string, name: string, cycle?: Customer['billingCycle']): Customer => ({
  id,
  name,
  phone: '',
  address: 'somewhere',
  billingCycle: cycle,
  createdAt: '',
});

const order = (
  id: string,
  customerId: string,
  total: number,
  date: string,
  status: Order['status'] = 'delivered'
): Order => ({
  id,
  customerId,
  lines: [{ name: 'Box', price: total, qty: 1 }],
  total,
  status,
  payment: 'cash',
  paid: false,
  date,
  source: 'manual',
  createdAt: '',
});

const bill = (id: string, customerId: string, start: string, end: string, amount: number): Bill => ({
  id,
  customerId,
  periodStart: start,
  periodEnd: end,
  amount,
  createdAt: '',
});

const payment = (
  id: string,
  customerId: string,
  amount: number,
  date: string
): Payment => ({ id, customerId, amount, date, method: 'cash', createdAt: '' });

// ---------------------------------------------------------------------------

const daily = customer('c-daily', 'Daily Dan', 'daily');
const monthly = customer('c-monthly', 'Monthly Meena', 'monthly');
const weekly = customer('c-weekly', 'Weekly Wasim', 'weekly');
const legacy = customer('c-legacy', 'No Cycle Set'); // undefined cycle

console.log('--- a daily customer is charged per delivery ---');
const dailyOrders = [
  order('d1', 'c-daily', 120, '2026-08-01'),
  order('d2', 'c-daily', 120, '2026-08-02'),
  order('d3', 'c-daily', 500, '2026-08-03', 'cancelled'), // skipped day
  order('d4', 'c-daily', 120, '2026-08-04', 'new'), // not delivered yet
];
let acc = customerAccount(daily, dailyOrders, [], []);
check('only delivered deliveries charged', acc.charged, 240);
check('cancelled and pending excluded', acc.deliveries, 2);
check('owes the full amount', acc.balance, 240);
check('status is owes', acc.status, 'owes');
check('not partly paid yet', acc.partlyPaid, false);
check('daily customers never show uninvoiced work', acc.uninvoiced.count, 0);

console.log('\n--- part payment leaves the remainder ---');
acc = customerAccount(daily, dailyOrders, [], [payment('p1', 'c-daily', 100, '2026-08-04')]);
check('paid recorded', acc.paid, 100);
check('balance is the remainder', acc.balance, 140);
check('flagged as partly paid', acc.partlyPaid, true);
check('still owes', acc.status, 'owes');

console.log('\n--- paying it all off settles the account ---');
acc = customerAccount(daily, dailyOrders, [], [
  payment('p1', 'c-daily', 100, '2026-08-04'),
  payment('p2', 'c-daily', 140, '2026-08-05'),
]);
check('balance zero', acc.balance, 0);
check('status settled', acc.status, 'settled');
check('no longer partly paid', acc.partlyPaid, false);
check('last payment date tracked', acc.lastPaymentDate, '2026-08-05');

console.log('\n--- overpaying leaves them in credit ---');
acc = customerAccount(daily, dailyOrders, [], [payment('p3', 'c-daily', 300, '2026-08-05')]);
check('negative balance', acc.balance, -60);
check('status credit', acc.status, 'credit');

console.log('\n--- a monthly customer is charged by the bill, not per delivery ---');
const monthlyOrders = [
  order('m1', 'c-monthly', 120, '2026-08-01'),
  order('m2', 'c-monthly', 120, '2026-08-02'),
  order('m3', 'c-monthly', 120, '2026-08-03'),
];
acc = customerAccount(monthly, monthlyOrders, [], []);
check('no bill means nothing charged', acc.charged, 0);
check('so the balance is zero', acc.balance, 0);
// ...but the deliveries must not disappear silently
check('three deliveries flagged as needing a bill', acc.uninvoiced.count, 3);
check('with a suggested figure at menu prices', acc.uninvoiced.suggested, 360);
check('earliest uninvoiced date', acc.uninvoiced.earliest, '2026-08-01');
check('latest uninvoiced date', acc.uninvoiced.latest, '2026-08-03');

console.log('\n--- the agreed amount is what gets charged, not the menu total ---');
// The owner agreed 3000 for the month even though menu prices come to 360.
const augustBill = bill('b1', 'c-monthly', '2026-08-01', '2026-08-31', 3000);
acc = customerAccount(monthly, monthlyOrders, [augustBill], []);
check('charged the agreed figure', acc.charged, 3000);
check('menu total ignored', acc.balance, 3000);
check('deliveries now covered by the bill', acc.uninvoiced.count, 0);

console.log('\n--- part payment against a monthly bill ---');
acc = customerAccount(monthly, monthlyOrders, [augustBill], [
  payment('p4', 'c-monthly', 2000, '2026-08-20'),
]);
check('balance is the shortfall', acc.balance, 1000);
check('partly paid', acc.partlyPaid, true);

console.log('\n--- deliveries outside the billed period still need billing ---');
const septemberOrder = order('m4', 'c-monthly', 120, '2026-09-01');
acc = customerAccount(monthly, [...monthlyOrders, septemberOrder], [augustBill], []);
check('September delivery not covered by the August bill', acc.uninvoiced.count, 1);
check('and its dates are reported', acc.uninvoiced.earliest, '2026-09-01');

console.log('\n--- weekly works the same way as monthly ---');
const weeklyOrders = [order('w1', 'c-weekly', 200, '2026-08-03'), order('w2', 'c-weekly', 200, '2026-08-04')];
check(
  'uninvoiced until a bill is raised',
  uninvoicedWork(weeklyOrders, [], weekly).count,
  2
);
check(
  'covered once the week is billed',
  uninvoicedWork(weeklyOrders, [bill('b2', 'c-weekly', '2026-08-03', '2026-08-09', 350)], weekly).count,
  0
);

console.log('\n--- a customer with no cycle set behaves as daily ---');
acc = customerAccount(legacy, [order('l1', 'c-legacy', 90, '2026-08-01')], [], []);
check('charged per delivery', acc.charged, 90);
check('cycle reported as daily', acc.cycle, 'daily');

console.log('\n--- one customer never affects another ---');
acc = customerAccount(daily, [...dailyOrders, ...monthlyOrders], [augustBill], [
  payment('p5', 'c-monthly', 3000, '2026-08-20'),
]);
check("other customer's deliveries excluded", acc.charged, 240);
check("other customer's payment excluded", acc.paid, 0);

console.log('\n--- the whole book ---');
const accounts = allAccounts(
  [daily, monthly, weekly, legacy],
  [...dailyOrders, ...monthlyOrders, ...weeklyOrders],
  [augustBill],
  [payment('p6', 'c-daily', 40, '2026-08-06')]
);
check('sorted with the biggest debt first', accounts.map((a) => a.customerName), [
  'Monthly Meena',
  'Daily Dan',
  'No Cycle Set',
  'Weekly Wasim',
]);
check('total owed adds only debts', totalOwed(accounts), 3000 + 200);
check('customers in credit do not reduce the total owed', totalOwed([
  { ...accounts[0], balance: -500 },
  { ...accounts[1], balance: 200 },
]), 200);
check('weekly work waiting to be billed is surfaced', totalUninvoiced(accounts), 400);
check(
  'attention list covers debts and unbilled work',
  accountsNeedingAttention(accounts).map((a) => a.customerName).sort(),
  ['Daily Dan', 'Monthly Meena', 'Weekly Wasim']
);

console.log('\n--- money received in a period ---');
const somePayments = [
  payment('x1', 'c-daily', 100, '2026-08-01'),
  payment('x2', 'c-daily', 50, '2026-08-15'),
  payment('x3', 'c-daily', 25, '2026-09-01'),
];
check('August only', paymentsInRange(somePayments, '2026-08-01', '2026-08-31'), 150);
check('single day', paymentsInRange(somePayments, '2026-08-15', '2026-08-15'), 50);
check('nothing in range', paymentsInRange(somePayments, '2026-07-01', '2026-07-31'), 0);

console.log('\n--- cash collection can never be counted twice ---');
check('id derives from the order', collectionPaymentId('order-123'), 'pay-order-order-123');
check('same order, same id', collectionPaymentId('order-123'), collectionPaymentId('order-123'));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
