import { productionCounts, totalBoxes } from './production';
import type { Order } from '../types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

const order = (
  id: string,
  customerId: string,
  lines: { name: string; qty: number; menuItemId?: string }[],
  status: Order['status'] = 'new'
): Order => ({
  id,
  customerId,
  lines: lines.map((l) => ({ name: l.name, qty: l.qty, price: 100, menuItemId: l.menuItemId })),
  total: 0,
  status,
  payment: 'cash',
  paid: false,
  date: '2026-07-30',
  source: 'manual',
  createdAt: '',
});

console.log('--- counts the kitchen cooks from ---');
const orders: Order[] = [
  order('o1', 'c1', [{ name: 'Basic box', qty: 6, menuItemId: 'basic' }]),
  order('o2', 'c2', [{ name: 'Basic box', qty: 4, menuItemId: 'basic' }]),
  order('o3', 'c3', [{ name: 'Protein box', qty: 12, menuItemId: 'protein' }]),
  order('o4', 'c4', [{ name: 'Chicken box', qty: 3, menuItemId: 'chicken' }]),
];
const counts = productionCounts(orders);
check('one row per box type', counts.map((c) => c.name), ['Protein box', 'Basic box', 'Chicken box']);
check('basic box quantities added up', counts.find((c) => c.name === 'Basic box')!.qty, 10);
check('protein box total', counts.find((c) => c.name === 'Protein box')!.qty, 12);
check('biggest batch listed first', counts[0].name, 'Protein box');
check('smallest batch last', counts[counts.length - 1].name, 'Chicken box');
check('total across all boxes', totalBoxes(counts), 25);

// Equal batches must still come out in a stable, predictable order rather than
// shuffling between refreshes while the kitchen is reading the list.
const tied = productionCounts([
  order('t1', 'c1', [{ name: 'Protein box', qty: 10, menuItemId: 'protein' }]),
  order('t2', 'c2', [{ name: 'Basic box', qty: 10, menuItemId: 'basic' }]),
]);
check('ties fall back to alphabetical', tied.map((c) => c.name), ['Basic box', 'Protein box']);

console.log('\n--- opening a count shows who it is for ---');
const basic = counts.find((c) => c.name === 'Basic box')!;
check('two customers under basic', basic.entries.length, 2);
check('their individual quantities', basic.entries.map((e) => e.qty), [6, 4]);
check('linked back to the orders', basic.entries.map((e) => e.order.id), ['o1', 'o2']);

console.log('\n--- cancelled and skipped are never cooked ---');
const withCancelled = productionCounts([
  ...orders,
  order('o5', 'c5', [{ name: 'Basic box', qty: 50, menuItemId: 'basic' }], 'cancelled'),
]);
check('cancelled excluded from the count', withCancelled.find((c) => c.name === 'Basic box')!.qty, 10);
check('total unchanged by a cancellation', totalBoxes(withCancelled), 25);

console.log('\n--- a customer taking two box types ---');
const mixed = productionCounts([
  order('o6', 'c6', [
    { name: 'Basic box', qty: 1, menuItemId: 'basic' },
    { name: 'Protein box', qty: 2, menuItemId: 'protein' },
  ]),
]);
check('appears under both boxes', mixed.map((c) => `${c.name}:${c.qty}`), ['Protein box:2', 'Basic box:1']);

console.log('\n--- custom one-off items still counted ---');
const custom = productionCounts([
  order('o7', 'c7', [{ name: 'Party tray', qty: 2 }]),
  order('o8', 'c8', [{ name: 'party tray', qty: 3 }]),
]);
check('same custom name merges regardless of case', custom.length, 1);
check('custom quantities added', custom[0].qty, 5);

console.log('\n--- nothing to cook ---');
check('empty list', productionCounts([]), []);
check('zero total', totalBoxes([]), 0);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
