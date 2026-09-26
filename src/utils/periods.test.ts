import { gapBeforePeriod, nextBillingPeriod, overlappingBills, periodLabel } from './billing';
import { addMonthsStr, daysBetween } from './dates';
import type { Bill } from '../types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

const bill = (id: string, start: string, end: string, amount = 1000): Bill => ({
  id,
  customerId: 'c1',
  periodStart: start,
  periodEnd: end,
  amount,
  createdAt: '',
});

console.log('--- adding months without drifting ---');
check('mid-month is simple', addMonthsStr('2026-08-12', 1), '2026-09-12');
check('across a year boundary', addMonthsStr('2026-12-12', 1), '2027-01-12');
check('going backwards', addMonthsStr('2026-08-12', -1), '2026-07-12');
// The trap: 31 Jan + 1 month must not become 3 March.
check('31 Jan clamps to end of Feb', addMonthsStr('2026-01-31', 1), '2026-02-28');
check('29 Jan in a leap year', addMonthsStr('2028-01-29', 1), '2028-02-29');
check('31 May clamps to 30 June', addMonthsStr('2026-05-31', 1), '2026-06-30');
// And clamping must not become permanent drift when stepping month by month
// from the original anchor each time.
check('anchor + 2 months from 31 Jan', addMonthsStr('2026-01-31', 2), '2026-03-31');

console.log('\n--- counting days ---');
check('same day', daysBetween('2026-08-12', '2026-08-12'), 0);
check('a week', daysBetween('2026-08-12', '2026-08-19'), 7);
check('across a month end', daysBetween('2026-08-30', '2026-09-02'), 3);

console.log('\n--- a customer who joined on the 12th ---');
// No bills yet: the first period starts the day they started.
let p = nextBillingPeriod('monthly', [], '2026-08-12')!;
check('first period starts on their start date', p.start, '2026-08-12');
check('and ends the day before the 12th comes round again', p.end, '2026-09-11');
check('reads naturally', p.label, '12 Aug – 11 Sep');

// Once that is billed, the next one picks up the very next day.
p = nextBillingPeriod('monthly', [bill('b1', '2026-08-12', '2026-09-11')], '2026-08-12')!;
check('second period starts the day after the first ended', p.start, '2026-09-12');
check('second period end', p.end, '2026-10-11');

// Three months in, still anchored to the 12th — no drift.
p = nextBillingPeriod(
  'monthly',
  [
    bill('b1', '2026-08-12', '2026-09-11'),
    bill('b2', '2026-09-12', '2026-10-11'),
    bill('b3', '2026-10-12', '2026-11-11'),
  ],
  '2026-08-12'
)!;
check('fourth period still starts on a 12th', p.start, '2026-11-12');
check('fourth period end', p.end, '2026-12-11');

console.log('\n--- a customer who started at the end of a month ---');
// Each period picks up the day after the last one ended, so a 31 Jan start
// settles onto the 28th rather than jumping about. That is deliberate: no gap
// and no overlap matters more for money than keeping the 31st.
p = nextBillingPeriod('monthly', [], '2026-01-31')!;
check('first period', [p.start, p.end], ['2026-01-31', '2026-02-27']);
p = nextBillingPeriod('monthly', [bill('b1', '2026-01-31', '2026-02-27')], '2026-01-31')!;
check('second period follows on with no gap', [p.start, p.end], ['2026-02-28', '2026-03-27']);
check('and leaves no unbilled day between them', gapBeforePeriod([bill('b1', '2026-01-31', '2026-02-27')], p.start), null);

console.log('\n--- weekly packs ---');
p = nextBillingPeriod('weekly', [], '2026-08-12')!;
check('a week is 7 days inclusive', [p.start, p.end], ['2026-08-12', '2026-08-18']);
p = nextBillingPeriod('weekly', [bill('b1', '2026-08-12', '2026-08-18')], '2026-08-12')!;
check('next week follows on', [p.start, p.end], ['2026-08-19', '2026-08-25']);

console.log('\n--- pay-per-delivery customers have no periods ---');
check('daily returns nothing', nextBillingPeriod('daily', [], '2026-08-12'), null);

console.log('\n--- bills are found out of order too ---');
p = nextBillingPeriod(
  'monthly',
  // Deliberately unsorted, and one deleted bill that must be ignored.
  [
    bill('b2', '2026-09-12', '2026-10-11'),
    { ...bill('bX', '2026-10-12', '2026-12-31'), deleted: true },
    bill('b1', '2026-08-12', '2026-09-11'),
  ],
  '2026-08-12'
)!;
check('follows the latest live bill, not the deleted one', p.start, '2026-10-12');

console.log('\n--- charging the same days twice must be caught ---');
const existing = [bill('b1', '2026-08-12', '2026-09-11')];
check('exact same range overlaps', overlappingBills(existing, '2026-08-12', '2026-09-11').length, 1);
check('a range inside it overlaps', overlappingBills(existing, '2026-08-20', '2026-08-25').length, 1);
check('a range straddling the start overlaps', overlappingBills(existing, '2026-08-01', '2026-08-13').length, 1);
check('a range straddling the end overlaps', overlappingBills(existing, '2026-09-10', '2026-09-20').length, 1);
check('the very next day does not overlap', overlappingBills(existing, '2026-09-12', '2026-10-11').length, 0);
check('the day before does not overlap', overlappingBills(existing, '2026-07-12', '2026-08-11').length, 0);
check('editing a bill ignores itself', overlappingBills(existing, '2026-08-12', '2026-09-11', 'b1').length, 0);

console.log('\n--- an unbilled gap must be noticed ---');
check('no previous bills means no gap', gapBeforePeriod([], '2026-08-12'), null);
check('following on exactly leaves no gap', gapBeforePeriod(existing, '2026-09-12'), null);
check('starting early is not a gap', gapBeforePeriod(existing, '2026-09-01'), null);
check('a week skipped is reported', gapBeforePeriod(existing, '2026-09-19'), {
  from: '2026-09-12',
  to: '2026-09-18',
  days: 7,
});

console.log('\n--- labels ---');
check('period label', periodLabel('2026-08-12', '2026-09-11'), '12 Aug – 11 Sep');
check('single day', periodLabel('2026-08-12', '2026-08-12'), '12 Aug – 12 Aug');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
