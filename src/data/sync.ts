import AsyncStorage from '@react-native-async-storage/async-storage';
import { cloudEnabled, mappers, supabase, TableName } from './remote';

export type SyncState = 'local' | 'syncing' | 'synced' | 'pending' | 'error';

interface PendingWrite {
  table: TableName;
  row: Record<string, unknown>;
}

const QUEUE_KEY = 'sf.pendingWrites.v1';

/**
 * Tracks cloud status for the whole app and holds writes that could not reach
 * the cloud (rider in a lift, patchy mobile data) until they can be retried.
 *
 * Writes are queued by row id, so five quick edits to one order become one
 * pending write carrying the newest version rather than five replays.
 *
 * Status is tracked per table and then combined, deliberately: with a single
 * shared status, one table failing while the others succeeded would get
 * overwritten and the app would claim "shared with team" while quietly not
 * saving something. A problem anywhere must stay visible.
 */
class SyncManager {
  private queue: PendingWrite[] = [];
  private listeners = new Set<() => void>();
  private loadedQueue = false;
  private flushing = false;
  private errors = new Map<TableName, string>();
  private syncingTables = new Set<TableName>();

  /** Worst status across all tables — problems win over successes. */
  getState(): SyncState {
    if (!cloudEnabled) return 'local';
    if (this.errors.size > 0) return 'error';
    if (this.queue.length > 0) return 'pending';
    if (this.syncingTables.size > 0) return 'syncing';
    return 'synced';
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  /** First reported problem, with its table named so it is actionable. */
  getLastError(): string | null {
    const first = this.errors.entries().next();
    if (first.done) return null;
    const [table, message] = first.value;
    const others = this.errors.size - 1;
    const suffix = others > 0 ? ` (and ${others} other table${others === 1 ? '' : 's'})` : '';
    return `${table}: ${message}${suffix}`;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private async loadQueue() {
    if (this.loadedQueue) return;
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    this.queue = raw ? JSON.parse(raw) : [];
    this.loadedQueue = true;
    if (this.queue.length > 0) this.emit();
  }

  private async persistQueue() {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }

  /** Push a row to the cloud, queueing it for later if the push fails. */
  async push(table: TableName, row: Record<string, unknown>): Promise<void> {
    if (!cloudEnabled || !supabase) return;
    await this.loadQueue();
    try {
      const { error } = await supabase.from(table).upsert(row);
      if (error) throw new Error(error.message);
      this.errors.delete(table);
      // A successful write means we are back online — drain anything waiting.
      if (this.queue.length > 0) await this.flush();
      else this.emit();
    } catch (err) {
      this.enqueue(table, row);
      this.errors.set(table, err instanceof Error ? err.message : String(err));
      await this.persistQueue();
      this.emit();
    }
  }

  private enqueue(table: TableName, row: Record<string, unknown>) {
    const idx = this.queue.findIndex((w) => w.table === table && w.row.id === row.id);
    if (idx >= 0) this.queue[idx] = { table, row };
    else this.queue.push({ table, row });
  }

  /** Retry every queued write. Safe to call often; only one run at a time. */
  async flush(): Promise<void> {
    if (!cloudEnabled || !supabase || this.flushing) return;
    await this.loadQueue();
    if (this.queue.length === 0) {
      this.emit();
      return;
    }
    this.flushing = true;
    this.emit();
    const remaining: PendingWrite[] = [];
    const failedTables = new Set<TableName>();
    for (const write of this.queue) {
      try {
        const { error } = await supabase.from(write.table).upsert(write.row);
        if (error) throw new Error(error.message);
      } catch (err) {
        this.errors.set(write.table, err instanceof Error ? err.message : String(err));
        failedTables.add(write.table);
        remaining.push(write);
      }
    }
    // Any table whose writes all went through is no longer a problem.
    for (const table of [...this.errors.keys()]) {
      if (!failedTables.has(table)) this.errors.delete(table);
    }
    this.queue = remaining;
    await this.persistQueue();
    this.flushing = false;
    this.emit();
  }

  markSyncing(table: TableName) {
    if (!cloudEnabled) return;
    this.syncingTables.add(table);
    this.emit();
  }

  markSynced(table: TableName) {
    if (!cloudEnabled) return;
    this.syncingTables.delete(table);
    this.errors.delete(table);
    this.emit();
  }

  markError(table: TableName, message: string) {
    if (!cloudEnabled) return;
    this.syncingTables.delete(table);
    this.errors.set(table, message);
    this.emit();
  }
}

export const sync = new SyncManager();

/**
 * Newest-wins comparison used when the same record changed in two places.
 * Timestamps are ISO strings, so comparing them as text orders them correctly.
 */
export function isNewer(candidate?: string, existing?: string): boolean {
  if (!candidate) return false;
  if (!existing) return true;
  return candidate > existing;
}

export const tableMappers = mappers;
export type { TableName };
