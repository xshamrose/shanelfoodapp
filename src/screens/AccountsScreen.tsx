import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { todayStr } from '../utils/dates';
import { allAccounts, totalOwed, totalUninvoiced } from '../utils/billing';
import { Period, PERIOD_LABELS, periodRange, riderCashForDate, salesSummary } from '../utils/accounts';

export default function AccountsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const orders = useCollection(db.orders);
  const expenses = useCollection(db.expenses);
  const handovers = useCollection(db.handovers);
  const staff = useCollection(db.staff);
  const customers = useCollection(db.customers);
  const [period, setPeriod] = useState<Period>('day');

  const today = todayStr();
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const payments = useCollection(db.payments);
  const bills = useCollection(db.bills);
  const summary = useMemo(
    () => salesSummary(orders, expenses, range, payments),
    [orders, expenses, range, payments]
  );

  const cashRows = useMemo(
    () => riderCashForDate(orders, handovers, staff, today),
    [orders, handovers, staff, today]
  );
  const cashToCollect = cashRows.reduce((sum, r) => sum + Math.max(0, r.outstanding), 0);

  const accounts = useMemo(
    () => allAccounts(customers, orders, bills, payments),
    [customers, orders, bills, payments]
  );
  const owed = totalOwed(accounts);
  const waitingToBill = totalUninvoiced(accounts);
  const owingCount = accounts.filter((a) => a.balance > 0).length;

  const profitPositive = summary.profit >= 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      {/* Period switch */}
      <View style={styles.periodRow}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[styles.periodChip, period === p && styles.periodChipOn]}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextOn]}>
              {PERIOD_LABELS[p]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.rangeLabel}>{range.label}</Text>

      {/* Profit headline */}
      <Card style={styles.profitCard}>
        <Text style={styles.profitLabel}>{profitPositive ? 'Profit' : 'Loss'}</Text>
        <Text style={[styles.profitValue, !profitPositive && { color: colors.danger }]}>
          {formatMoney(Math.abs(summary.profit))}
        </Text>
        <Text style={styles.profitHint}>
          {formatMoney(summary.revenue)} delivered − {formatMoney(summary.expenses)} spent
        </Text>
      </Card>

      {/* Sales detail */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>Sales</Text>
        <Row label={`Delivered (${summary.deliveredCount})`} value={formatMoney(summary.revenue)} strong />
        <Row label="Money received" value={formatMoney(summary.received)} tone={colors.success} />
        {summary.pendingCount > 0 && (
          <Row
            label={`Still to deliver (${summary.pendingCount})`}
            value={formatMoney(summary.pending)}
            tone={colors.muted}
          />
        )}
        <View style={styles.divider} />
        <Text style={styles.subLabel}>How they paid</Text>
        <Row label="Cash" value={formatMoney(summary.byPayment.cash)} />
        <Row label="UPI" value={formatMoney(summary.byPayment.upi)} />
        <Row label="Bank transfer" value={formatMoney(summary.byPayment.transfer)} />
        {summary.cancelledCount > 0 && (
          <Text style={styles.footnote}>
            {summary.cancelledCount} cancelled or skipped — not counted in any figure above.
          </Text>
        )}
      </Card>

      {/* Expenses */}
      <Pressable onPress={() => nav.navigate('Expenses')}>
        {({ pressed }) => (
          <Card style={[{ marginTop: spacing.md }, pressed && { opacity: 0.85 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Expenses</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
            <Row label="Total spent" value={formatMoney(summary.expenses)} strong />
            {summary.expensesByCategory.length === 0 ? (
              <Text style={styles.footnote}>Nothing recorded yet — tap to add.</Text>
            ) : (
              summary.expensesByCategory.map((c) => (
                <Row key={c.category} label={c.category} value={formatMoney(c.amount)} tone={colors.muted} />
              ))
            )}
          </Card>
        )}
      </Pressable>

      {/* Cash from riders (always today, not the period) */}
      <Pressable onPress={() => nav.navigate('CashReconciliation')}>
        {({ pressed }) => (
          <Card style={[{ marginTop: spacing.md }, pressed && { opacity: 0.85 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Cash from riders · today</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
            {cashRows.length === 0 ? (
              <Text style={styles.footnote}>No deliveries today yet.</Text>
            ) : (
              <>
                <Row
                  label="Still to hand in"
                  value={formatMoney(cashToCollect)}
                  strong
                  tone={cashToCollect > 0 ? colors.warning : colors.success}
                />
                <Text style={styles.footnote}>
                  {cashRows.length} rider{cashRows.length === 1 ? '' : 's'} out today
                </Text>
              </>
            )}
          </Card>
        )}
      </Pressable>

      {/* Customer dues */}
      <Pressable onPress={() => nav.navigate('Dues')}>
        {({ pressed }) => (
          <Card style={[{ marginTop: spacing.md }, pressed && { opacity: 0.85 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Customer accounts</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
            {owed === 0 && waitingToBill === 0 ? (
              <Text style={styles.footnote}>Everyone is paid up and every delivery is billed. 🎉</Text>
            ) : (
              <>
                {owed > 0 && (
                  <Row
                    label={`${owingCount} customer${owingCount === 1 ? '' : 's'} owe you`}
                    value={formatMoney(owed)}
                    strong
                    tone={colors.danger}
                  />
                )}
                {waitingToBill > 0 && (
                  <Row
                    label="Deliveries waiting to be billed"
                    value={formatMoney(waitingToBill)}
                    tone={colors.info}
                  />
                )}
                {waitingToBill > 0 && (
                  <Text style={styles.footnote}>
                    Weekly and monthly customers are only charged once you raise their bill.
                  </Text>
                )}
              </>
            )}
          </Card>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && { fontWeight: '700', color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontSize: 17 }, tone ? { color: tone } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  periodRow: { flexDirection: 'row', gap: spacing.sm },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { fontWeight: '700', color: colors.text, fontSize: 14 },
  periodTextOn: { color: '#fff' },
  rangeLabel: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  profitCard: { alignItems: 'center', paddingVertical: spacing.xl },
  profitLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profitValue: { fontSize: 34, fontWeight: '800', color: colors.success, marginTop: 4 },
  profitHint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  subLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: spacing.md },
  rowLabel: { flex: 1, fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  footnote: { fontSize: 12, color: colors.muted, marginTop: 6, fontStyle: 'italic' },
});
