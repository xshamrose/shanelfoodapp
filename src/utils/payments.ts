import { PaymentMethod } from '../types';

/**
 * How money reaches you. This is separate from how often a customer is billed —
 * a daily, weekly or monthly customer can each pay by any of these.
 *
 * An earlier version mixed the two together and offered "Monthly bill" as if it
 * were a payment method. Records written then hold the old values, so everything
 * here accepts them and maps them forward rather than requiring a migration:
 *
 *   'cod'     -> cash      (it always meant cash at the door)
 *   'monthly' -> transfer  (it meant "settles the monthly bill later")
 */

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  transfer: 'Bank transfer',
};

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'transfer'];

export function normalizePaymentMethod(raw: unknown): PaymentMethod {
  if (raw === 'cash' || raw === 'cod') return 'cash';
  if (raw === 'upi') return 'upi';
  return 'transfer';
}

export function paymentLabel(raw: unknown): string {
  return PAYMENT_METHOD_LABELS[normalizePaymentMethod(raw)];
}

/**
 * True when a rider physically takes notes for this delivery.
 *
 * This is what decides whether cash is prompted for on delivery and whether it
 * counts in a rider's end-of-day reconciliation, so it has to keep recognising
 * the old 'cod' value.
 */
export function isCashMethod(raw: unknown): boolean {
  return normalizePaymentMethod(raw) === 'cash';
}
