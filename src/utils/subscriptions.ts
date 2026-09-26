import { saveOrder } from '../data/actions';
import { db } from '../data/store';
import { Order, SETTINGS_ID, Subscription, Weekday } from '../types';
import { closedDaysOf, isClosedDay } from './calendar';
import { addDaysStr, toDateStr, todayStr } from './dates';
import { orderTotal } from './orders';
import { activeRounds } from './rounds';

/** How far ahead deliveries are created, so dispatch can see the week coming. */
export const GENERATION_DAYS = 7;

/**
 * The id a generated delivery always gets.
 *
 * Deliberately derived from the subscription, the date and the round rather than
 * random: if the owner and dispatch both open the app at 6am, both try to create
 * the same delivery, and because they compute the same id the second one simply
 * overwrites the first instead of creating a duplicate breakfast.
 */
export function generatedOrderId(subscriptionId: string, date: string, roundId: string): string {
  return `sub-${subscriptionId}-${date}-${roundId}`;
}

/**
 * The id used before rounds existed. Checked when generating so deliveries
 * created by the older version are recognised instead of duplicated.
 */
export function legacyOrderId(subscriptionId: string, date: string): string {
  return `sub-${subscriptionId}-${date}`;
}

/** The delivery for this subscription on this day and round, old id or new. */
export function findGeneratedOrder(subscriptionId: string, date: string, roundId: string) {
  return (
    db.orders.get(generatedOrderId(subscriptionId, date, roundId)) ??
    db.orders.get(legacyOrderId(subscriptionId, date))
  );
}

export function skipId(subscriptionId: string, date: string): string {
  return `skip-${subscriptionId}-${date}`;
}

function weekdayOf(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() as Weekday;
}

/** The weekdays the kitchen is shut, from settings. */
export function closedDays(): Weekday[] {
  return closedDaysOf(db.settings.get(SETTINGS_ID));
}

/**
 * Does this subscription deliver on this date, ignoring skips?
 *
 * A day the kitchen is closed is never a delivery day, whatever the plan says —
 * there is nobody there to cook it.
 */
export function isDeliveryDay(sub: Subscription, dateStr: string): boolean {
  if (!sub.active) return false;
  if (dateStr < sub.startDate) return false;
  if (sub.endDate && dateStr > sub.endDate) return false;
  if (isClosedDay(dateStr, closedDays())) return false;
  return sub.daysOfWeek.includes(weekdayOf(dateStr));
}

export function isSkipped(subscriptionId: string, dateStr: string): boolean {
  return db.skips.get(skipId(subscriptionId, dateStr)) !== undefined;
}

/** The dates this subscription is scheduled to deliver on, over a window. */
export function upcomingDeliveryDates(sub: Subscription, days: number): string[] {
  const start = todayStr();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysStr(start, i);
    if (isDeliveryDay(sub, date)) dates.push(date);
  }
  return dates;
}

/**
 * Create any missing deliveries for the days ahead.
 *
 * Safe to call as often as you like: a delivery is only created if that exact
 * id has never existed, so already-generated, cancelled, edited and deleted
 * deliveries are all left alone.
 */
export async function generateSubscriptionOrders(): Promise<number> {
  const subs = db.subscriptions.getAll().filter((s) => s.active);
  if (subs.length === 0) return 0;

  const rounds = activeRounds();
  if (rounds.length === 0) return 0;

  let created = 0;
  for (const sub of subs) {
    // A plan saved before rounds existed has none chosen; treat it as the first
    // round of the day rather than silently delivering nothing.
    const subRounds = sub.roundIds.length > 0 ? sub.roundIds : [rounds[0].id];

    for (let i = 0; i < GENERATION_DAYS; i++) {
      const date = addDaysStr(todayStr(), i);
      if (!isDeliveryDay(sub, date)) continue;
      if (isSkipped(sub.id, date)) continue;

      for (const roundId of subRounds) {
        if (!rounds.some((r) => r.id === roundId)) continue; // round was retired

        const id = generatedOrderId(sub.id, date, roundId);
        // The legacy id covers deliveries made before rounds existed, so they
        // are not recreated a second time under the new naming.
        if (db.orders.everExisted(id)) continue;
        if (roundId === subRounds[0] && db.orders.everExisted(legacyOrderId(sub.id, date))) continue;

        const order: Order = {
          id,
          customerId: sub.customerId,
          roundId,
          lines: sub.lines,
          total: orderTotal(sub.lines),
          status: 'new',
          payment: sub.payment,
          paid: false,
          riderId: sub.riderId,
          notes: sub.notes,
          date,
          source: 'subscription',
          createdAt: new Date().toISOString(),
        };
        await db.orders.upsert(order);
        created++;
      }
    }
  }
  return created;
}

/** Every delivery this subscription has on a given day, across all its rounds. */
function ordersForDay(sub: Subscription, date: string) {
  const rounds = activeRounds();
  const subRounds = sub.roundIds.length > 0 ? sub.roundIds : rounds.map((r) => r.id).slice(0, 1);
  const found = subRounds
    .map((roundId) => findGeneratedOrder(sub.id, date, roundId))
    .filter((o): o is Order => o !== undefined);
  // Deduplicate: the legacy id can be returned for more than one round.
  return [...new Map(found.map((o) => [o.id, o])).values()];
}

/**
 * Mark a day as skipped. If the delivery for that day was already created and
 * has not gone out yet, cancel it too — cancelled deliveries are left out of
 * sales and billing, which is what "don't charge me for days I'm away" means.
 */
export async function skipDay(sub: Subscription, date: string, reason?: string): Promise<void> {
  await db.skips.upsert({
    id: skipId(sub.id, date),
    subscriptionId: sub.id,
    date,
    reason,
    createdAt: new Date().toISOString(),
  });

  // Away for the day means away for every round of it.
  for (const existing of ordersForDay(sub, date)) {
    if (existing.status !== 'delivered' && existing.status !== 'cancelled') {
      await saveOrder({ ...existing, status: 'cancelled' });
    }
  }
}

/** Every delivery this plan created, found by the prefix in its id. */
function ordersFromSubscription(subscriptionId: string): Order[] {
  return db.orders.getAll().filter((o) => o.id.startsWith(`sub-${subscriptionId}-`));
}

/**
 * Cancel the deliveries a plan has already created but not yet delivered.
 *
 * Generation runs a week ahead, so stopping a plan is not enough on its own —
 * without this the kitchen keeps cooking for a customer who has left, and the
 * rider keeps turning up at their door.
 */
export async function cancelUpcomingOrders(
  subscriptionId: string,
  fromDate: string = todayStr()
): Promise<number> {
  let cancelled = 0;
  for (const order of ordersFromSubscription(subscriptionId)) {
    if (order.date < fromDate) continue; // leave history alone
    if (order.status === 'delivered' || order.status === 'cancelled') continue;
    await saveOrder({ ...order, status: 'cancelled' });
    cancelled++;
  }
  return cancelled;
}

/**
 * Stop a plan for good, and clear the deliveries it had already lined up.
 * Past deliveries stay exactly as they were, so the records and bills are safe.
 */
export async function stopSubscription(sub: Subscription): Promise<number> {
  const cancelled = await cancelUpcomingOrders(sub.id);
  await db.subscriptions.remove(sub.id);
  return cancelled;
}

/** Pause a plan indefinitely, or start it again. */
export async function setSubscriptionActive(
  sub: Subscription,
  active: boolean
): Promise<number> {
  if (!active) {
    const cancelled = await cancelUpcomingOrders(sub.id);
    await db.subscriptions.upsert({ ...sub, active: false });
    return cancelled;
  }
  await db.subscriptions.upsert({ ...sub, active: true });
  // Put the coming week back straight away rather than waiting for a restart.
  return generateSubscriptionOrders();
}

export interface PauseResult {
  /** Delivery days actually skipped — closed days and non-delivery days excluded. */
  days: string[];
  /** What those days would have been worth at the plan's own prices. */
  value: number;
}

/**
 * Pause a customer from one date to another.
 *
 * Absences are rarely a single day — someone goes away for a week, or has a
 * family emergency and is gone for a fortnight — and tapping twelve days one at
 * a time is not a workable way to record that.
 *
 * Returns what was skipped so the caller can tell the owner what it is worth,
 * which is what they need in order to decide between extending the pack and
 * discounting the bill.
 */
export async function pauseRange(
  sub: Subscription,
  fromDate: string,
  toDate: string,
  reason?: string
): Promise<PauseResult> {
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;

  const days: string[] = [];
  for (let date = start; date <= end; date = addDaysStr(date, 1)) {
    // Only real delivery days count — a closed Sunday inside the range was
    // never going to be delivered, so it is not part of what they missed.
    if (!isDeliveryDay(sub, date)) continue;
    days.push(date);
    await skipDay(sub, date, reason);
  }

  return { days, value: days.length * orderTotal(sub.lines) };
}

/** Lift a pause across a date range, putting those deliveries back. */
export async function resumeRange(
  sub: Subscription,
  fromDate: string,
  toDate: string
): Promise<number> {
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  let restored = 0;
  for (let date = start; date <= end; date = addDaysStr(date, 1)) {
    if (!isSkipped(sub.id, date)) continue;
    await unskipDay(sub, date);
    restored++;
  }
  return restored;
}

/**
 * Push a plan's end date back by a number of delivery days.
 *
 * Used when the owner decides a paused customer should get the food they paid
 * for rather than a smaller bill.
 */
export async function extendByDeliveryDays(sub: Subscription, deliveryDays: number): Promise<string> {
  let date = sub.endDate ?? todayStr();
  let added = 0;
  // Walk forward over real delivery days only, so a fortnight's pause adds a
  // fortnight of actual deliveries rather than fourteen calendar days.
  while (added < deliveryDays) {
    date = addDaysStr(date, 1);
    if (isDeliveryDay({ ...sub, endDate: undefined }, date)) added++;
  }
  await db.subscriptions.upsert({ ...sub, endDate: date });
  return date;
}

/** Undo a skip, putting the day's deliveries back if they had been cancelled. */
export async function unskipDay(sub: Subscription, date: string): Promise<void> {
  await db.skips.remove(skipId(sub.id, date));

  for (const existing of ordersForDay(sub, date)) {
    if (existing.status === 'cancelled') {
      await db.orders.upsert({ ...existing, status: 'new' });
    }
  }
  // Anything not yet created is picked up by the next generation pass.
  await generateSubscriptionOrders();
}

export interface MonthSummary {
  monthLabel: string;
  delivered: number;
  scheduled: number;
  skipped: number;
  perDelivery: number;
  billable: number;
}

/**
 * What this subscriber owes for the current month: only deliveries that
 * actually happened or are still standing, never the days they skipped.
 */
export function monthSummary(sub: Subscription, reference = new Date()): MonthSummary {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const perDelivery = orderTotal(sub.lines);

  let delivered = 0;
  let scheduled = 0;
  let skipped = 0;

  const shut = closedDays();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = toDateStr(new Date(year, month, day));
    if (!sub.daysOfWeek.includes(weekdayOf(date))) continue;
    // Closed days are not delivered and not billed.
    if (isClosedDay(date, shut)) continue;
    if (date < sub.startDate) continue;
    if (sub.endDate && date > sub.endDate) continue;

    const roundsForDay = sub.roundIds.length > 0 ? sub.roundIds.length : 1;

    if (isSkipped(sub.id, date)) {
      skipped += roundsForDay;
      continue;
    }
    // Count each round separately — two rounds a day is two deliveries to bill.
    const dayOrders = ordersForDay(sub, date);
    if (dayOrders.length === 0) {
      scheduled += roundsForDay;
      continue;
    }
    for (const order of dayOrders) {
      if (order.status === 'cancelled') skipped++;
      else if (order.status === 'delivered') delivered++;
      else scheduled++;
    }
  }

  const monthLabel = reference.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return {
    monthLabel,
    delivered,
    scheduled,
    skipped,
    perDelivery,
    billable: (delivered + scheduled) * perDelivery,
  };
}
