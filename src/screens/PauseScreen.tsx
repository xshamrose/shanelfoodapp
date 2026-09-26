import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, notify } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';
import { orderTotal } from '../utils/orders';
import { extendByDeliveryDays, isDeliveryDay, pauseRange } from '../utils/subscriptions';

const QUICK = [
  { label: 'Just today', days: 0 },
  { label: '2 days', days: 1 },
  { label: '3 days', days: 2 },
  { label: 'A week', days: 6 },
  { label: '2 weeks', days: 13 },
];

export default function PauseScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Pause'>>();
  useCollection(db.subscriptions);
  useCollection(db.skips);
  useCollection(db.orders);
  const customers = useCollection(db.customers);

  const sub = db.subscriptions.get(route.params.subscriptionId);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<{ days: number; value: number } | null>(null);

  // Which days in the chosen range are actually deliveries — a closed Sunday in
  // the middle of a week off was never going to be delivered anyway.
  const affected = useMemo(() => {
    if (!sub) return [];
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const days: string[] = [];
    for (let d = start; d <= end && days.length < 120; d = addDaysStr(d, 1)) {
      if (isDeliveryDay(sub, d)) days.push(d);
    }
    return days;
  }, [sub, from, to]);

  if (!sub) return null;
  const customer = customers.find((c) => c.id === sub.customerId);
  const perDelivery = orderTotal(sub.lines);
  const value = affected.length * perDelivery;
  const isPack = (customer?.billingCycle ?? 'daily') !== 'daily';

  const apply = async () => {
    if (affected.length === 0) {
      return notify('There are no delivery days in that range for this customer.');
    }
    const result = await pauseRange(sub, from, to, reason.trim() || undefined);
    setDone({ days: result.days.length, value: result.value });
  };

  const extend = async () => {
    if (!done) return;
    const newEnd = await extendByDeliveryDays(sub, done.days);
    notify(`Pack extended — it now runs to ${newEnd}.`);
    nav.goBack();
  };

  // ---------------------------------------------------------------- confirmed
  if (done) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }}>
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={styles.doneTitle}>
            {done.days} deliver{done.days === 1 ? 'y' : 'ies'} paused
          </Text>
          <Text style={styles.doneBody}>
            {customer?.name} will not be delivered to, and those days are worth{' '}
            {formatMoney(done.value)}.
          </Text>
        </Card>

        {isPack ? (
          <>
            <Text style={styles.chooseTitle}>What should happen to their pack?</Text>
            <Text style={styles.chooseBody}>
              You paused {done.days} deliver{done.days === 1 ? 'y' : 'ies'} worth{' '}
              {formatMoney(done.value)}. Pick whichever you agreed with them — there is no wrong
              answer, it just depends on the customer.
            </Text>

            <Pressable onPress={extend}>
              {({ pressed }) => (
                <Card style={[styles.option, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="calendar-outline" size={24} color={colors.primaryDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>Give them the days back</Text>
                    <Text style={styles.optionBody}>
                      Their pack runs {done.days} deliver{done.days === 1 ? 'y' : 'ies'} longer, so
                      they still get the food they paid for. The bill does not change.
                    </Text>
                  </View>
                </Card>
              )}
            </Pressable>

            <Pressable onPress={() => nav.goBack()}>
              {({ pressed }) => (
                <Card style={[styles.option, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="cash-outline" size={24} color={colors.primaryDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>Charge them less this period</Text>
                    <Text style={styles.optionBody}>
                      Leave the dates as they are and take {formatMoney(done.value)} off when you
                      raise their bill. The skipped days are already excluded from the count.
                    </Text>
                  </View>
                </Card>
              )}
            </Pressable>
          </>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.chooseBody}>
              They pay per delivery, so nothing more to do — the paused days simply are not charged.
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <Button title="Done" icon="checkmark" onPress={() => nav.goBack()} />
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  // ------------------------------------------------------------------ picking
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <Text style={styles.who}>{customer?.name ?? 'Customer'}</Text>
      <Text style={styles.intro}>
        Customers go away at no notice and for however long they need. Set the range here rather
        than tapping each day.
      </Text>

      <Text style={styles.label}>How long, starting today</Text>
      <View style={styles.chipRow}>
        {QUICK.map((q) => {
          const end = addDaysStr(todayStr(), q.days);
          const on = from === todayStr() && to === end;
          return (
            <Pressable
              key={q.label}
              onPress={() => {
                setFrom(todayStr());
                setTo(end);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{q.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dateRow}>
        <View style={{ flex: 1 }}>
          <Field label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        </View>
      </View>

      <Card style={styles.previewCard}>
        {affected.length === 0 ? (
          <Text style={styles.previewEmpty}>
            No delivery days in that range — check the dates, or this customer may not be scheduled
            then.
          </Text>
        ) : (
          <>
            <Text style={styles.previewTitle}>
              {affected.length} deliver{affected.length === 1 ? 'y' : 'ies'} will be paused
            </Text>
            <Text style={styles.previewBody}>
              {dateLabel(affected[0])}
              {affected.length > 1 ? ` to ${dateLabel(affected[affected.length - 1])}` : ''} · worth{' '}
              {formatMoney(value)}
            </Text>
          </>
        )}
      </Card>

      <Field
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. travelling to native place"
      />

      <Button
        title={
          affected.length === 0
            ? 'Nothing to pause'
            : `Pause ${affected.length} deliver${affected.length === 1 ? 'y' : 'ies'}`
        }
        icon="pause-circle-outline"
        onPress={apply}
        disabled={affected.length === 0}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  who: { fontSize: 20, fontWeight: '800', color: colors.text },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 4, marginBottom: spacing.lg },
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
  previewCard: { backgroundColor: colors.infoSoft, borderColor: colors.infoSoft, marginBottom: spacing.lg },
  previewTitle: { fontSize: 15, fontWeight: '800', color: colors.info },
  previewBody: { fontSize: 13, color: colors.info, marginTop: 4 },
  previewEmpty: { fontSize: 13, color: colors.info },
  doneTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  doneBody: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center' },
  chooseTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl },
  chooseBody: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 4, marginBottom: spacing.md },
  option: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginBottom: spacing.md },
  optionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  optionBody: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
});
