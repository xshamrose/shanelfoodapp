import AsyncStorage from '@react-native-async-storage/async-storage';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useReducer } from 'react';
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
  SETTINGS_ID,
  Subscription,
  SubscriptionSkip,
  Synced,
} from '../types';
import { DEFAULT_CLOSED_DAYS } from '../utils/calendar';
import { cloudEnabled, Mapper, mappers, supabase, TableName } from './remote';
import { isNewer, sync } from './sync';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Old enough that any real edit made later always wins over a seeded row. */
const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z';

/**
 * A persisted collection of records.
 *
 * Reads are always instant and always work: the on-device copy is the one the
 * UI renders. When the cloud is configured, the same data is mirrored to
 * Supabase so the whole team shares it — pulled at startup, kept current by
 * live updates, and pushed on every change (queued if the phone is offline).
 * When the cloud is not configured, everything below still works, just on
 * this device alone.
 */
export class Collection<T extends Synced> {
  private items: T[] = [];
  private loaded = false;
  private loading: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;

  constructor(
    private storageKey: string,
    private table: TableName,
    private mapper: Mapper<T>,
    private seed: T[] = []
  ) {}

  init(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loading) this.loading = this.doInit();
    return this.loading;
  }

  private async doInit() {
    // 1. On-device copy first, so the app is usable immediately and offline.
    const raw = await AsyncStorage.getItem(this.storageKey);
    this.items = raw ? JSON.parse(raw) : [];
    const hadLocal = this.items.length > 0;

    if (!cloudEnabled) {
      if (!hadLocal && this.seed.length > 0) {
        this.items = this.seed.map((s) => ({ ...s, updatedAt: SEED_TIMESTAMP }));
        await this.persist();
      }
      this.loaded = true;
      this.emit();
      return;
    }

    this.loaded = true;
    this.emit();

    // 2. Catch up with the cloud in the background. Deliberately not awaited:
    // a rider with no signal must not be left waiting on a network call to use
    // the app. Screens refresh through emit() when the data lands.
    void this.pull(hadLocal).then(() => this.listenForChanges());
  }

  private async pull(hadLocal: boolean) {
    if (!supabase) return;
    sync.markSyncing(this.table);
    try {
      // A phone with one bar can leave a request hanging indefinitely; give up
      // and fall back to the on-device copy rather than never settling.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 15000);
      const { data, error } = await supabase
        .from(this.table)
        .select('*')
        .abortSignal(abort.signal);
      clearTimeout(timer);
      if (error) throw new Error(error.message);

      const remote = (data ?? []).map((r) => this.mapper.fromRow(r));

      if (remote.length === 0) {
        // Nobody has set this table up yet. Send up what this phone has, or
        // the starter rows if it has nothing either.
        const toSend =
          hadLocal && this.items.length > 0
            ? this.items
            : this.seed.map((s) => ({ ...s, updatedAt: SEED_TIMESTAMP }));
        if (toSend.length > 0) {
          this.items = toSend;
          await this.persist();
          this.emit();
          for (const item of toSend) await sync.push(this.table, this.mapper.toRow(item));
        }
      } else {
        for (const item of remote) this.mergeOne(item);
        // Anything created on this phone while it was alone still needs to go up.
        const remoteIds = new Set(remote.map((r) => r.id));
        for (const local of this.items) {
          if (!remoteIds.has(local.id)) await sync.push(this.table, this.mapper.toRow(local));
        }
        await this.persist();
        this.emit();
      }
      sync.markSynced(this.table);
      // Retry anything that failed to send earlier.
      await sync.flush();
    } catch (err) {
      sync.markError(this.table, err instanceof Error ? err.message : String(err));
      // The cloud is unreachable and this phone has nothing yet — a first run
      // with no signal, or a table that has not been created. Fall back to the
      // starter rows so the app is still usable; the next successful pull merges
      // real data over them, and their old timestamps mean the cloud always wins.
      if (this.items.length === 0 && this.seed.length > 0) {
        this.items = this.seed.map((s) => ({ ...s, updatedAt: SEED_TIMESTAMP }));
        await this.persist();
        this.emit();
      }
    }
  }

  private listenForChanges() {
    if (!supabase || this.channel) return;
    this.channel = supabase
      .channel(`sf-${this.table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: this.table },
        (payload) => {
          const row = (payload.new ?? {}) as Record<string, any>;
          if (row.id) {
            if (this.mergeOne(this.mapper.fromRow(row))) {
              this.persist();
              this.emit();
            }
            return;
          }
          const goneId = (payload.old as Record<string, any> | undefined)?.id;
          if (goneId) {
            this.items = this.items.filter((i) => i.id !== goneId);
            this.persist();
            this.emit();
          }
        }
      )
      .subscribe();
  }

  /** Apply one incoming record. Returns true if it actually changed anything. */
  private mergeOne(incoming: T): boolean {
    const existing = this.items.find((i) => i.id === incoming.id);
    if (!existing) {
      this.items = [...this.items, incoming];
      return true;
    }
    if (!isNewer(incoming.updatedAt, existing.updatedAt)) return false;
    this.items = this.items.map((i) => (i.id === incoming.id ? incoming : i));
    return true;
  }

  isLoaded() {
    return this.loaded;
  }

  getAll(): T[] {
    return this.items.filter((i) => !i.deleted);
  }

  get(id: string): T | undefined {
    const found = this.items.find((i) => i.id === id);
    return found && !found.deleted ? found : undefined;
  }

  /**
   * True if this id was ever used, including records that were deleted.
   * Subscription order generation needs this: a delivery the team deleted must
   * stay deleted rather than reappearing on the next app open.
   */
  everExisted(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  async upsert(item: T): Promise<void> {
    const stamped = { ...item, updatedAt: new Date().toISOString() };
    const idx = this.items.findIndex((i) => i.id === stamped.id);
    if (idx >= 0) this.items = this.items.map((i) => (i.id === stamped.id ? stamped : i));
    else this.items = [...this.items, stamped];
    await this.persist();
    this.emit();
    await sync.push(this.table, this.mapper.toRow(stamped));
  }

  /**
   * Soft delete: the record is flagged rather than dropped, so the removal can
   * travel to the other phones instead of silently reappearing on next sync.
   */
  async remove(id: string): Promise<void> {
    const existing = this.items.find((i) => i.id === id);
    if (!existing) return;
    const tombstone = { ...existing, deleted: true, updatedAt: new Date().toISOString() };
    this.items = this.items.map((i) => (i.id === id ? tombstone : i));
    await this.persist();
    this.emit();
    await sync.push(this.table, this.mapper.toRow(tombstone));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async persist() {
    await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.items));
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

const seedStaff: Staff[] = [
  { id: 'owner-1', name: 'Shanel', role: 'owner', pin: '1234', active: true },
  { id: 'dispatch-1', name: 'Dispatch Desk', role: 'dispatch', pin: '2345', active: true },
  { id: 'rider-1', name: 'Rider One', role: 'rider', pin: '3456', active: true },
  { id: 'accounts-1', name: 'Accounts Desk', role: 'accountant', pin: '4567', active: true },
];

const seedCustomers: Customer[] = [
  {
    id: 'sample-cust-1',
    name: 'Sample Customer (edit me)',
    phone: '9800000000',
    address: '12 Green Park Road, 2nd floor',
    landmark: 'Opposite the blue pharmacy',
    notes: 'Ring the bell twice',
    createdAt: new Date('2026-07-29').toISOString(),
  },
];

/** Fixed ids so every device seeds the same two rounds rather than duplicates. */
const seedRounds: MealRound[] = [
  { id: 'round-morning', name: 'Morning', sortOrder: 1, active: true },
  { id: 'round-evening', name: 'Evening', sortOrder: 2, active: true },
];

const seedMenu: MenuItem[] = [
  { id: 'sample-menu-1', name: 'Veg Meal Box', price: 120, category: 'Meal Boxes', available: true },
  { id: 'sample-menu-2', name: 'Chicken Meal Box', price: 180, category: 'Meal Boxes', available: true },
  { id: 'sample-menu-3', name: 'Chapati (5 pcs)', price: 50, category: 'Add-ons', available: true },
];

export const db = {
  staff: new Collection<Staff>('sf.staff.v1', 'staff', mappers.staff, seedStaff),
  customers: new Collection<Customer>('sf.customers.v1', 'customers', mappers.customers, seedCustomers),
  menu: new Collection<MenuItem>('sf.menu.v1', 'menu_items', mappers.menu_items, seedMenu),
  orders: new Collection<Order>('sf.orders.v1', 'orders', mappers.orders, []),
  subscriptions: new Collection<Subscription>(
    'sf.subscriptions.v1',
    'subscriptions',
    mappers.subscriptions,
    []
  ),
  skips: new Collection<SubscriptionSkip>(
    'sf.subscriptionSkips.v1',
    'subscription_skips',
    mappers.subscription_skips,
    []
  ),
  rounds: new Collection<MealRound>('sf.mealRounds.v1', 'meal_rounds', mappers.meal_rounds, seedRounds),
  settings: new Collection<AppSettings>('sf.settings.v1', 'app_settings', mappers.app_settings, [
    { id: SETTINGS_ID, closedDays: DEFAULT_CLOSED_DAYS },
  ]),
  bills: new Collection<Bill>('sf.bills.v1', 'bills', mappers.bills, []),
  payments: new Collection<Payment>('sf.payments.v1', 'payments', mappers.payments, []),
  expenses: new Collection<Expense>('sf.expenses.v1', 'expenses', mappers.expenses, []),
  handovers: new Collection<CashHandover>(
    'sf.cashHandovers.v1',
    'cash_handovers',
    mappers.cash_handovers,
    []
  ),
};

/** Load every collection — called once at startup. */
export async function initAllCollections(): Promise<void> {
  await Promise.all([
    db.staff.init(),
    db.customers.init(),
    db.menu.init(),
    db.orders.init(),
    db.subscriptions.init(),
    db.skips.init(),
    db.rounds.init(),
    db.settings.init(),
    db.bills.init(),
    db.payments.init(),
    db.expenses.init(),
    db.handovers.init(),
  ]);
}

/** React hook: subscribe a component to a collection's live contents. */
export function useCollection<T extends Synced>(collection: Collection<T>): T[] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    let mounted = true;
    collection.init().then(() => {
      if (mounted) force();
    });
    const unsub = collection.subscribe(force);
    return () => {
      mounted = false;
      unsub();
    };
  }, [collection]);
  return collection.getAll();
}
