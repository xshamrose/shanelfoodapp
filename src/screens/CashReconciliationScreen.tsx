import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Tag, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, uid, useCollection } from '../data/store';
import { colors, CURRENCY, formatMoney, radius, spacing } from '../theme';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';
import { RiderCash, riderCashForDate } from '../utils/accounts';

export default function CashReconciliationScreen() {
  const { user } = useAuth();
  const orders = useCollection(db.orders);
  const handovers = useCollection(db.handovers);
  const staff = useCollection(db.staff);
  const [date, setDate] = useState(todayStr());
  const [entry, setEntry] = useState<Record<string, string>>({});

  const rows = useMemo(
    () => riderCashForDate(orders, handovers, staff, date),
    [orders, handovers, staff, date]
  );

  const record = async (row: RiderCash, amount: number) => {
    if (!user) return;
    if (!amount || isNaN(amount) || amount <= 0) return notify('Enter how much cash you received.');
    await db.handovers.upsert({
      id: uid(),
      riderId: row.riderId,
      date,
      amount,
      receivedBy: user.id,
      createdAt: new Date().toISOString(),
    });
    setEntry((e) => ({ ...e, [row.riderId]: '' }));
  };

  const dayHandovers = handovers.filter((h) => h.date === date);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <View style={styles.dateBar}>
        <Pressable onPress={() => setDate(addDaysStr(date, -1))} style={styles.arrow} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.primaryDark} />
        </Pressable>
        <Pressable onPress={() => setDate(todayStr())}>
          <Text style={styles.dateText}>{dateLabel(date)}</Text>
        </Pressable>
        <Pressable onPress={() => setDate(addDaysStr(date, 1))} style={styles.arrow} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={colors.primaryDark} />
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <Card>
          <Text style={styles.empty}>No deliveries on this day.</Text>
        </Card>
      ) : (
        rows.map((row) => {
          const settled = row.outstanding === 0;
          const over = row.outstanding < 0;
          return (
            <Card key={row.riderId} style={{ marginBottom: spacing.md }}>
              <View style={styles.riderHeader}>
                <Text style={styles.riderName}>{row.riderName}</Text>
                {settled ? (
                  <Tag text="Settled" tone="success" />
                ) : over ? (
                  <Tag text="Handed in extra" tone="warning" />
                ) : (
                  <Tag text={`${formatMoney(row.outstanding)} to hand in`} tone="danger" />
                )}
              </View>

              <Line label={`Deliveries (${row.deliveries})`} value="" />
              <Line label="Cash collected from customers" value={formatMoney(row.collected)} />
              <Line label="Handed in to office" value={formatMoney(row.handedOver)} />
              <View style={styles.divider} />
              <Line
                label={over ? 'Handed in more than collected' : 'Still with the rider'}
                value={formatMoney(Math.abs(row.outstanding))}
                strong
                tone={settled ? colors.success : over ? colors.warning : colors.danger}
              />

              {row.uncollected > 0 && (
                <View style={styles.warnBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                  <Text style={styles.warnText}>
                    {formatMoney(row.uncollected)} of cash orders were delivered without collecting —
                    the customer owes this, not the rider.
                  </Text>
                </View>
              )}

              {!settled && !over && (
                <View style={styles.entryRow}>
                  <TextInput
                    value={entry[row.riderId] ?? ''}
                    onChangeText={(v) => setEntry((e) => ({ ...e, [row.riderId]: v }))}
                    placeholder={`${CURRENCY} received`}
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                  <Button
                    title="Record"
                    onPress={() => record(row, Number(entry[row.riderId]))}
                    style={{ paddingVertical: 12, paddingHorizontal: spacing.lg }}
                  />
                </View>
              )}
              {!settled && !over && (
                <Pressable onPress={() => record(row, row.outstanding)} hitSlop={6}>
                  <Text style={styles.fullLink}>
                    Received the full {formatMoney(row.outstanding)}
                  </Text>
                </Pressable>
              )}
            </Card>
          );
        })
      )}

      {dayHandovers.length > 0 && (
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={styles.sectionLabel}>Handovers recorded on this day</Text>
          {dayHandovers.map((h) => {
            const rider = staff.find((s) => s.id === h.riderId);
            const receiver = staff.find((s) => s.id === h.receivedBy);
            return (
              <View key={h.id} style={styles.handoverRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.handoverName}>{rider?.name ?? 'Unknown rider'}</Text>
                  <Text style={styles.handoverMeta}>
                    received by {receiver?.name ?? 'unknown'}
                  </Text>
                </View>
                <Text style={styles.handoverAmount}>{formatMoney(h.amount)}</Text>
                <Pressable onPress={() => db.handovers.remove(h.id)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

function Line({
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
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && { fontWeight: '700', color: colors.text }]}>{label}</Text>
      <Text style={[styles.lineValue, strong && { fontSize: 17 }, tone ? { color: tone } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { fontSize: 18, fontWeight: '800', color: colors.text },
  empty: { color: colors.muted, fontStyle: 'italic', textAlign: 'center' },
  riderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  riderName: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: spacing.md },
  lineLabel: { flex: 1, fontSize: 14, color: colors.muted },
  lineValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  warnBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 17 },
  entryRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  fullLink: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  handoverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  handoverName: { fontSize: 14, fontWeight: '700', color: colors.text },
  handoverMeta: { fontSize: 12, color: colors.muted },
  handoverAmount: { fontSize: 15, fontWeight: '800', color: colors.text },
});
