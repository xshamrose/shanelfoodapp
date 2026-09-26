import { AppSettings, Weekday, WEEKDAY_SHORT } from '../types';

/**
 * Which days the kitchen works.
 *
 * Shanel Foods is shut on Sundays, so nothing should ever be cooked, delivered
 * or billed for a Sunday. Kept as a setting rather than hard-coded, in case the
 * closed day ever moves or a second one is added.
 */

export const DEFAULT_CLOSED_DAYS: Weekday[] = [0]; // Sunday

export function closedDaysOf(settings: AppSettings | undefined): Weekday[] {
  return settings?.closedDays ?? DEFAULT_CLOSED_DAYS;
}

export function weekdayOfDate(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() as Weekday;
}

export function isClosedDay(dateStr: string, closedDays: Weekday[]): boolean {
  return closedDays.includes(weekdayOfDate(dateStr));
}

export function isClosedWeekday(day: Weekday, closedDays: Weekday[]): boolean {
  return closedDays.includes(day);
}

/** "Sunday", or "Sunday and Wednesday" when more than one day is shut. */
export function describeClosedDays(closedDays: Weekday[]): string {
  const names = [...closedDays]
    .sort((a, b) => a - b)
    .map((d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]);
  if (names.length === 0) return 'never';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The working days of the week, in order, for building day presets. */
export function openWeekdays(closedDays: Weekday[]): Weekday[] {
  return ([1, 2, 3, 4, 5, 6, 0] as Weekday[]).filter((d) => !closedDays.includes(d));
}

export function shortName(day: Weekday): string {
  return WEEKDAY_SHORT[day];
}
