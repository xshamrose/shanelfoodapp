import {
  closedDaysOf,
  DEFAULT_CLOSED_DAYS,
  describeClosedDays,
  isClosedDay,
  openWeekdays,
  weekdayOfDate,
} from './calendar';
import type { Weekday } from '../types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got ${a}\n        want ${e}`}`);
}

// August 2026: the 2nd is a Sunday, so 3rd Mon ... 8th Sat, 9th Sun.
const SUN = '2026-08-02';
const MON = '2026-08-03';
const SAT = '2026-08-08';
const NEXT_SUN = '2026-08-09';

console.log('--- reading the weekday off a date ---');
check('Sunday is 0', weekdayOfDate(SUN), 0);
check('Monday is 1', weekdayOfDate(MON), 1);
check('Saturday is 6', weekdayOfDate(SAT), 6);

console.log('--- Sunday is closed by default ---');
check('default closed days', DEFAULT_CLOSED_DAYS, [0]);
check('no settings falls back to Sunday', closedDaysOf(undefined), [0]);
check(
  'settings win when present',
  closedDaysOf({ id: 'app-settings', closedDays: [0, 3] }),
  [0, 3]
);

const sundayClosed: Weekday[] = [0];
check('Sunday is closed', isClosedDay(SUN, sundayClosed), true);
check('next Sunday too', isClosedDay(NEXT_SUN, sundayClosed), true);
check('Monday is open', isClosedDay(MON, sundayClosed), false);
check('Saturday is open', isClosedDay(SAT, sundayClosed), false);

console.log('\n--- the working week, Monday first ---');
check('Mon to Sat when Sunday is shut', openWeekdays(sundayClosed), [1, 2, 3, 4, 5, 6]);
check('every day when nothing is shut', openWeekdays([]), [1, 2, 3, 4, 5, 6, 0]);
check('two days shut', openWeekdays([0, 3]), [1, 2, 4, 5, 6]);

console.log('\n--- how closed days read to the user ---');
check('one day', describeClosedDays([0]), 'Sunday');
check('two days', describeClosedDays([0, 3]), 'Sunday and Wednesday');
check('three days', describeClosedDays([0, 3, 6]), 'Sunday, Wednesday and Saturday');
check('sorted regardless of input order', describeClosedDays([6, 0]), 'Sunday and Saturday');
check('none', describeClosedDays([]), 'never');

console.log('\n--- a Mon-Sat monthly pack never lands on a Sunday ---');
// Walk a fortnight and confirm no closed day survives the filter.
const monSatPack: Weekday[] = [1, 2, 3, 4, 5, 6];
const hits: string[] = [];
for (let i = 0; i < 14; i++) {
  const d = new Date(2026, 7, 2 + i); // from Sun 2 Aug
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const inPack = monSatPack.includes(weekdayOfDate(iso));
  if (inPack && !isClosedDay(iso, sundayClosed)) hits.push(iso);
}
check('12 delivery days in the fortnight', hits.length, 12);
check('no Sunday among them', hits.filter((d) => weekdayOfDate(d) === 0), []);
check('starts on the Monday', hits[0], MON);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
