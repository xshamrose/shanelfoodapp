export type Role = 'owner' | 'dispatch' | 'rider' | 'accountant';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  dispatch: 'Dispatch',
  rider: 'Delivery Rider',
  accountant: 'Accountant',
};

/**
 * Fields every stored record carries so two phones can agree on what is newest.
 * `deleted` is a soft delete — a real delete could not travel to other phones.
 */
export interface Synced {
  id: string;
  updatedAt?: string;
  deleted?: boolean;
}

export interface Staff extends Synced {
  name: string;
  role: Role;
  pin: string;
  active: boolean;
}

/**
 * How often a customer settles up.
 *
 * Daily customers pay for each delivery, so every delivery is a charge.
 * Weekly and monthly customers pay against a bill you raise for the period,
 * at an amount you agree with them — so their deliveries are not charged
 * individually, or they would be billed twice.
 */
export type BillingCycle = 'daily' | 'weekly' | 'monthly';

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  daily: 'Pays per delivery',
  weekly: 'Weekly bill',
  monthly: 'Monthly bill',
};

export const BILLING_CYCLE_SHORT: Record<BillingCycle, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** A bill raised for a period, at the amount agreed with the customer. */
export interface Bill extends Synced {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  note?: string;
  raisedBy?: string;
  createdAt: string;
}

/** Money received from a customer. Any amount, so part payments just work. */
export interface Payment extends Synced {
  customerId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  recordedBy?: string;
  /** Set when this came from a rider collecting cash on a delivery. */
  orderId?: string;
  createdAt: string;
}

export interface Customer extends Synced {
  name: string;
  phone: string;
  address: string;
  /** Defaults to daily when not set. */
  billingCycle?: BillingCycle;
  landmark?: string;
  notes?: string;
  /** A Google Maps link the customer shared, kept exactly as pasted. */
  mapLink?: string;
  /** Pulled out of the link when it contains them, so we can open directions. */
  lat?: number;
  lng?: number;
  createdAt: string;
}

export interface MenuItem extends Synced {
  name: string;
  price: number;
  category?: string;
  available: boolean;
}

export type OrderStatus = 'new' | 'preparing' | 'out' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  preparing: 'Preparing',
  out: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** The button label that moves an order to its next status. */
export const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  new: { next: 'preparing', label: 'Start preparing' },
  preparing: { next: 'out', label: 'Send out for delivery' },
  out: { next: 'delivered', label: 'Mark delivered' },
};

/**
 * How the money arrives. Applies to every billing cycle — daily, weekly and
 * monthly customers can each pay by any of these.
 *
 * Labels and legacy-value handling live in utils/payments.ts.
 */
export type PaymentMethod = 'cash' | 'upi' | 'transfer';

export interface OrderLine {
  menuItemId?: string;
  name: string;
  price: number;
  qty: number;
}

/**
 * Company-wide settings. A single row, so it always has the same id.
 */
export interface AppSettings extends Synced {
  /**
   * Weekdays the kitchen is shut. No deliveries are created on these days and
   * nothing is billed for them, because there is nothing to cook.
   */
  closedDays: Weekday[];
}

export const SETTINGS_ID = 'app-settings';

/**
 * A delivery round in the day — morning, evening, and whatever else gets added.
 *
 * Stored as data rather than fixed in code so a lunch round is a setting the
 * owner can add, not a change to the app.
 */
export interface MealRound extends Synced {
  name: string;
  /** Lower sorts first, so rounds read in the order they happen. */
  sortOrder: number;
  active: boolean;
}

export const EXPENSE_CATEGORIES = [
  'Ingredients',
  'Gas & fuel',
  'Salaries',
  'Rent',
  'Packaging',
  'Transport',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense extends Synced {
  /** Local YYYY-MM-DD — the day the money went out. */
  date: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  /** Who paid it, for the owner's benefit. */
  paidBy?: string;
  createdAt: string;
}

/**
 * Cash a rider handed in to the office. Kept separate from orders because what
 * a rider collected and what they have handed over are two different facts, and
 * the gap between them is exactly what the accountant needs to see.
 */
export interface CashHandover extends Synced {
  riderId: string;
  date: string;
  amount: number;
  note?: string;
  receivedBy: string;
  createdAt: string;
}

/** 0 = Sunday … 6 = Saturday, matching JavaScript's getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Subscription extends Synced {
  customerId: string;
  /** What this customer gets on every delivery, at the agreed price. */
  lines: OrderLine[];
  daysOfWeek: Weekday[];
  /** Which rounds this customer takes — morning, evening, or both. */
  roundIds: string[];
  payment: PaymentMethod;
  /**
   * The price agreed for one billing period — a week for a weekly pack, a month
   * for a monthly one. Recorded here so the figure is captured when the pack is
   * sold, and offered again when the bill is raised. Not used for daily packs,
   * which are charged per delivery.
   */
  packAmount?: number;
  riderId?: string;
  notes?: string;
  /** Local YYYY-MM-DD. */
  startDate: string;
  endDate?: string;
  active: boolean;
  createdAt: string;
}

/**
 * One day a subscriber asked to be skipped. Stored as its own record rather
 * than a list on the subscription, so two people skipping different days at
 * the same time cannot overwrite each other.
 */
export interface SubscriptionSkip extends Synced {
  subscriptionId: string;
  date: string;
  reason?: string;
  createdAt: string;
}

export interface Order extends Synced {
  customerId: string;
  /** Which round of the day this goes out on. */
  roundId?: string;
  lines: OrderLine[];
  total: number;
  status: OrderStatus;
  payment: PaymentMethod;
  paid: boolean;
  riderId?: string;
  notes?: string;
  /** Delivery date as local YYYY-MM-DD. */
  date: string;
  source: 'manual' | 'subscription';
  createdAt: string;
  deliveredAt?: string;
  deliveredBy?: string;
}
