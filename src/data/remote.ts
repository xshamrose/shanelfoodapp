import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { normalizePaymentMethod } from '../utils/payments';
import { CLOUD_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import {
  AppSettings,
  Bill,
  CashHandover,
  Customer,
  Expense,
  MealRound,
  MenuItem,
  Order,
  Payment,
  Staff,
  Subscription,
  SubscriptionSkip,
} from '../types';

export const supabase: SupabaseClient | null = CLOUD_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export const cloudEnabled = supabase !== null;

export type TableName =
  | 'staff'
  | 'customers'
  | 'menu_items'
  | 'orders'
  | 'subscriptions'
  | 'subscription_skips'
  | 'expenses'
  | 'cash_handovers'
  | 'meal_rounds'
  | 'bills'
  | 'payments'
  | 'app_settings';

/**
 * Row <-> object mappers. The database uses snake_case columns so the tables
 * stay readable in Supabase's own table editor; the app uses camelCase.
 */
export interface Mapper<T> {
  toRow: (item: T) => Record<string, unknown>;
  fromRow: (row: Record<string, any>) => T;
}

/**
 * Force one canonical timestamp format.
 *
 * Postgres hands back "2026-07-29T10:30:00+00:00" while the app writes
 * "2026-07-29T10:30:00.000Z" — same instant, different text. Since "newest
 * change wins" compares timestamps as text, keep both sides in one format so
 * that ordering never depends on how the two spellings happen to sort.
 */
function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

const staffMapper: Mapper<Staff> = {
  toRow: (s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    pin: s.pin,
    active: s.active,
    updated_at: s.updatedAt,
    deleted: s.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pin: r.pin,
    active: r.active,
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const customerMapper: Mapper<Customer> = {
  toRow: (c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    landmark: c.landmark ?? null,
    notes: c.notes ?? null,
    billing_cycle: c.billingCycle ?? 'daily',
    map_link: c.mapLink ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted: c.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? '',
    address: r.address,
    landmark: r.landmark ?? undefined,
    notes: r.notes ?? undefined,
    billingCycle: r.billing_cycle ?? 'daily',
    mapLink: r.map_link ?? undefined,
    lat: r.lat === null || r.lat === undefined ? undefined : Number(r.lat),
    lng: r.lng === null || r.lng === undefined ? undefined : Number(r.lng),
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const menuMapper: Mapper<MenuItem> = {
  toRow: (m) => ({
    id: m.id,
    name: m.name,
    price: m.price,
    category: m.category ?? null,
    available: m.available,
    updated_at: m.updatedAt,
    deleted: m.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    category: r.category ?? undefined,
    available: r.available,
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const roundMapper: Mapper<MealRound> = {
  toRow: (r) => ({
    id: r.id,
    name: r.name,
    sort_order: r.sortOrder,
    active: r.active,
    updated_at: r.updatedAt,
    deleted: r.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    name: r.name,
    sortOrder: Number(r.sort_order ?? 0),
    active: r.active,
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const orderMapper: Mapper<Order> = {
  toRow: (o) => ({
    id: o.id,
    customer_id: o.customerId,
    round_id: o.roundId ?? null,
    lines: o.lines,
    total: o.total,
    status: o.status,
    payment: o.payment,
    paid: o.paid,
    rider_id: o.riderId ?? null,
    notes: o.notes ?? null,
    date: o.date,
    source: o.source,
    created_at: o.createdAt,
    delivered_at: o.deliveredAt ?? null,
    delivered_by: o.deliveredBy ?? null,
    updated_at: o.updatedAt,
    deleted: o.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    customerId: r.customer_id,
    roundId: r.round_id ?? undefined,
    lines: r.lines ?? [],
    total: Number(r.total),
    status: r.status,
    payment: normalizePaymentMethod(r.payment),
    paid: r.paid,
    riderId: r.rider_id ?? undefined,
    notes: r.notes ?? undefined,
    date: r.date,
    source: r.source,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    deliveredAt: toIso(r.delivered_at),
    deliveredBy: r.delivered_by ?? undefined,
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const subscriptionMapper: Mapper<Subscription> = {
  toRow: (s) => ({
    id: s.id,
    customer_id: s.customerId,
    lines: s.lines,
    days_of_week: s.daysOfWeek,
    round_ids: s.roundIds,
    payment: s.payment,
    pack_amount: s.packAmount ?? null,
    rider_id: s.riderId ?? null,
    notes: s.notes ?? null,
    start_date: s.startDate,
    end_date: s.endDate ?? null,
    active: s.active,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted: s.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    customerId: r.customer_id,
    lines: r.lines ?? [],
    daysOfWeek: r.days_of_week ?? [],
    roundIds: r.round_ids ?? [],
    payment: normalizePaymentMethod(r.payment),
    packAmount: r.pack_amount === null || r.pack_amount === undefined ? undefined : Number(r.pack_amount),
    riderId: r.rider_id ?? undefined,
    notes: r.notes ?? undefined,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    active: r.active,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const skipMapper: Mapper<SubscriptionSkip> = {
  toRow: (s) => ({
    id: s.id,
    subscription_id: s.subscriptionId,
    date: s.date,
    reason: s.reason ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted: s.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    subscriptionId: r.subscription_id,
    date: r.date,
    reason: r.reason ?? undefined,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const expenseMapper: Mapper<Expense> = {
  toRow: (e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    amount: e.amount,
    note: e.note ?? null,
    paid_by: e.paidBy ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted: e.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    date: r.date,
    category: r.category,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    paidBy: r.paid_by ?? undefined,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const handoverMapper: Mapper<CashHandover> = {
  toRow: (h) => ({
    id: h.id,
    rider_id: h.riderId,
    date: h.date,
    amount: h.amount,
    note: h.note ?? null,
    received_by: h.receivedBy,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
    deleted: h.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    riderId: r.rider_id,
    date: r.date,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    receivedBy: r.received_by,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const billMapper: Mapper<Bill> = {
  toRow: (b) => ({
    id: b.id,
    customer_id: b.customerId,
    period_start: b.periodStart,
    period_end: b.periodEnd,
    amount: b.amount,
    note: b.note ?? null,
    raised_by: b.raisedBy ?? null,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    deleted: b.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    customerId: r.customer_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    raisedBy: r.raised_by ?? undefined,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const paymentMapper: Mapper<Payment> = {
  toRow: (p) => ({
    id: p.id,
    customer_id: p.customerId,
    date: p.date,
    amount: p.amount,
    method: p.method,
    note: p.note ?? null,
    recorded_by: p.recordedBy ?? null,
    order_id: p.orderId ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted: p.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    customerId: r.customer_id,
    date: r.date,
    amount: Number(r.amount),
    method: normalizePaymentMethod(r.method),
    note: r.note ?? undefined,
    recordedBy: r.recorded_by ?? undefined,
    orderId: r.order_id ?? undefined,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

const settingsMapper: Mapper<AppSettings> = {
  toRow: (s) => ({
    id: s.id,
    closed_days: s.closedDays,
    updated_at: s.updatedAt,
    deleted: s.deleted ?? false,
  }),
  fromRow: (r) => ({
    id: r.id,
    closedDays: r.closed_days ?? [],
    updatedAt: toIso(r.updated_at),
    deleted: r.deleted,
  }),
};

export const mappers = {
  staff: staffMapper,
  customers: customerMapper,
  menu_items: menuMapper,
  orders: orderMapper,
  subscriptions: subscriptionMapper,
  subscription_skips: skipMapper,
  expenses: expenseMapper,
  cash_handovers: handoverMapper,
  meal_rounds: roundMapper,
  bills: billMapper,
  payments: paymentMapper,
  app_settings: settingsMapper,
} as const;
