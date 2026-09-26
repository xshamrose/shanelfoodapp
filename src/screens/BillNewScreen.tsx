import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, confirmAsync, Field, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, uid, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, formatMoney, radius, spacing } from '../theme';
import {
  chargeableOrders,
  cycleOf,
  gapBeforePeriod,
  nextBillingPeriod,
  overlappingBills,
  uninvoicedWork,
} from '../utils/billing';
import { addDaysStr, dateLabel, toDateStr, todayStr } from '../utils/dates';

interface Preset {
  label: string;
  start: string;
  end: string;
}

function buildPresets(): Preset[] {
  const now = new Date();
  const today = todayStr();
  const monthStart = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const lastMonthStart = toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = toDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
  return [
    { label: 'This month', start: monthStart, end: monthEnd },
    { label: 'Last month', start: lastMonthStart, end: lastMonthEnd },
    { label: 'Last 7 days', start: addDaysStr(today, -6), end: today },
  ];
}

export default function BillNewScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'BillNew'>>();
  const { user } = useAuth();
  const customers = useCollection(db.customers);
  const orders = useCollection(db.orders);
  const bills = useCollection(db.bills);
  const subscriptions = useCollection(db.subscriptions);

  const customer = customers.find((c) => c.id === route.params.customerId);
  const presets = useMemo(buildPresets, []);

  const outstanding = useMemo(
    () => (customer ? uninvoicedWork(orders, bills, customer) : undefined),
    [customer, orders, bills]
  );

  const theirBills = useMemo(
    () => bills.filter((b) => b.customerId === route.params.customerId),
    [bills, route.params.customerId]
  );

  /**
   * Their own billing period, which is rarely a calendar month — someone who
   * joined on the 12th runs 12th to 11th. Anchored to their plan's start date,
   * then each period picks up where the last bill ended.
   */
  const theirPeriod = useMemo(() => {
    if (!customer) return null;
    const sub = subscriptions.find((s) => s.customerId === customer.id && !s.deleted);
    const anchor = sub?.startDate ?? outstanding?.earliest ?? todayStr();
    return nextBillingPeriod(cycleOf(customer), theirBills, anchor);
  }, [customer, subscriptions, theirBills, outstanding]);

  // Default to their own period; fall back to whatever is unbilled.
  const [start, setStart] = useState(
    theirPeriod?.start ?? outstanding?.earliest ?? presets[0].start
  );
  const [end, setEnd] = useState(theirPeriod?.end ?? outstanding?.latest ?? presets[0].end);
  // Their agreed pack price, recorded when the pack was set up. Offered here so
  // the figure does not have to be remembered — still fully editable.
  const agreed = useMemo(
    () =>
      subscriptions.find((s) => s.customerId === route.params.customerId && s.active)?.packAmount,
    [subscriptions, route.params.customerId]
  );
  const [amount, setAmount] = useState(agreed !== undefined ? String(agreed) : '');
  const [note, setNote] = useState('');

  if (!customer) return null;

  const inPeriod = chargeableOrders(orders, customer.id).filter(
    (o) => o.date >= start && o.date <= end
  );
  const atMenuPrices = inPeriod.reduce((sum, o) => sum + o.total, 0);
  const overlaps = overlappingBills(theirBills, start, end);
  const gap = gapBeforePeriod(theirBills, start);

  const save = async () => {
    const value = Number(amount);
    if (!amount.trim() || isNaN(value) || value <= 0) {
      return notify('Enter the amount you agreed with the customer.');
    }
    if (end < start) return notify('The end date cannot be before the start date.');
    if (overlaps.length > 0) {
      const ok = await confirmAsync(
        'Already billed for these days',
        `${customer.name} has a bill covering ${overlaps
          .map((b) => `${b.periodStart} to ${b.periodEnd}`)
          .join(', ')}. Raising this charges them twice for the same food. Continue anyway?`
      );
      if (!ok) return;
    }
    await db.bills.upsert({
      id: uid(),
      customerId: customer.id,
      periodStart: start,
      periodEnd: end,
      amount: value,
      note: note.trim() || undefined,
      raisedBy: user?.id,
      createdAt: new Date().toISOString(),
    });
    nav.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
        <Text style={styles.who}>{customer.name}</Text>

        <Text style={styles.label}>Period covered</Text>
        {theirPeriod && (
          <Pressable
            onPress={() => {
              setStart(theirPeriod.start);
              setEnd(theirPeriod.end);
            }}
            style={[
              styles.theirPeriod,
              start === theirPeriod.start && end === theirPeriod.end && styles.theirPeriodOn,
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={
                start === theirPeriod.start && end === theirPeriod.end ? '#fff' : colors.primaryDark
              }
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.theirPeriodTitle,
                  start === theirPeriod.start && end === theirPeriod.end && { color: '#fff' },
                ]}
              >
                Their period · {theirPeriod.label}
              </Text>
              <Text
                style={[
                  styles.theirPeriodBody,
                  start === theirPeriod.start && end === theirPeriod.end && { color: '#fff' },
                ]}
              >
                {theirBills.length === 0
                  ? 'Runs from the day their pack started, not the 1st of the month.'
                  : 'Picks up the day after their last bill ended.'}
              </Text>
            </View>
          </Pressable>
        )}
        <View style={styles.chipRow}>
          {presets.map((p) => {
            const on = p.start === start && p.end === end;
            return (
              <Pressable
                key={p.label}
                onPress={() => {
                  setStart(p.start);
                  setEnd(p.end);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Field label="From" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          </View>
        </View>

        {overlaps.length > 0 && (
          <Card style={styles.dangerCard}>
            <View style={styles.warnHeader}>
              <Ionicons name="alert-circle" size={20} color={colors.danger} />
              <Text style={styles.dangerTitle}>These days are already billed</Text>
            </View>
            <Text style={styles.dangerBody}>
              {overlaps.map((b) => `${b.periodStart} to ${b.periodEnd}`).join(', ')} — raising this
              would charge {customer.name} twice for the same food. Change the dates unless you
              mean to.
            </Text>
          </Card>
        )}

        {gap && (
          <Card style={styles.warnCard}>
            <View style={styles.warnHeader}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
              <Text style={styles.warnTitle}>
                {gap.days} day{gap.days === 1 ? '' : 's'} left unbilled
              </Text>
            </View>
            <Text style={styles.warnBody}>
              Nothing covers {dateLabel(gap.from)} to {dateLabel(gap.to)}. Start this bill on{' '}
              {gap.from} instead if those days should be charged.
            </Text>
          </Card>
        )}

        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {inPeriod.length} deliver{inPeriod.length === 1 ? 'y' : 'ies'} in this period
          </Text>
          <Text style={styles.infoBody}>
            {agreed !== undefined
              ? `Their agreed pack price is ${formatMoney(agreed)}, filled in below. At menu prices these deliveries would be ${formatMoney(atMenuPrices)}. Change the figure if this period is different.`
              : `At menu prices that comes to ${formatMoney(atMenuPrices)}. This is only for your reference — enter whatever you agreed with ${customer.name}.`}
          </Text>
        </Card>

        <Field
          label={`Amount to bill (${CURRENCY}) *`}
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 3000"
          keyboardType="numeric"
          autoFocus
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. includes 2 extra chapati days"
          multiline
        />

        <Button title="Raise this bill" icon="checkmark" onPress={save} />
        <Text style={styles.footnote}>
          Raising the bill is what puts the amount on their account. Deliveries in this period stop
          showing as waiting to be billed.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  who: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  theirPeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  theirPeriodOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  theirPeriodTitle: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  theirPeriodBody: { fontSize: 12, color: colors.primaryDark, marginTop: 2, lineHeight: 16 },
  warnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft, marginBottom: spacing.md },
  dangerTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.danger },
  dangerBody: { fontSize: 12, color: colors.danger, marginTop: 6, lineHeight: 17 },
  warnCard: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft, marginBottom: spacing.md },
  warnTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.warning },
  warnBody: { fontSize: 12, color: colors.warning, marginTop: 6, lineHeight: 17 },
  infoCard: { backgroundColor: colors.infoSoft, borderColor: colors.infoSoft, marginBottom: spacing.lg },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.info },
  infoBody: { fontSize: 12, color: colors.info, marginTop: 4, lineHeight: 17 },
  footnote: { fontSize: 12, color: colors.muted, marginTop: spacing.md, lineHeight: 17 },
});
