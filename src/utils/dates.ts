/** Local date as YYYY-MM-DD (never UTC — the kitchen day is the local day). */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateStr(date);
}

/**
 * Add calendar months, clamping to the end of the month.
 *
 * 31 January plus a month is 28 February, not the 3rd of March — a customer who
 * started on the 31st should not have their billing date drift forward every
 * month.
 */
export function addMonthsStr(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetMonth = m - 1 + months;
  // Day 0 of the next month is the last day of the target month.
  const lastDayOfTarget = new Date(y, targetMonth + 1, 0).getDate();
  return toDateStr(new Date(y, targetMonth, Math.min(d, lastDayOfTarget)));
}

/** Whole days between two dates, ignoring time of day. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", "Yesterday", or "Tue 29 Jul". */
export function dateLabel(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === addDaysStr(today, 1)) return 'Tomorrow';
  if (dateStr === addDaysStr(today, -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}
