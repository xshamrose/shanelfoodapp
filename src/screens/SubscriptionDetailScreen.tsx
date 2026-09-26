import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, confirmAsync, Tag, notify } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { ORDER_STATUS_LABELS } from '../types';
import { paymentLabel } from '../utils/payments';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';
import { orderTotal } from '../utils/orders';
import {
  findGeneratedOrder,
  isDeliveryDay,
  isSkipped,
  monthSummary,
  setSubscriptionActive,
  skipDay,
  stopSubscription,
  unskipDay,
} from '../utils/subscriptions';
import { describeDays } from './SubscriptionsScreen';

/** One clearly-labelled thing you can do, with a plain sentence saying what happens. */
function ActionCard({
  icon,
  title,
  body,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
  tone?: 'danger';
}) {
  const accent = tone === 'danger' ? colors.danger : colors.primaryDark;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card style={[styles.actionCard, pressed && { opacity: 0.85 }]}>
          <Ionicons name={icon} size={26} color={accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, tone === 'danger' && { color: colors.danger }]}>
              {title}
            </Text>
            <Text style={styles.actionBody}>{body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Card>
      )}
    </Pressable>
  );
}

/** How far ahead the team can plan skips. */
const PLANNING_DAYS = 21;

export default function SubscriptionDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SubscriptionDetail'>>();
  useCollection(db.subscriptions);
  useCollection(db.skips);
  useCollection(db.orders);
  const customers = useCollection(db.customers);
  const staff = useCollection(db.staff);

  const sub = db.subscriptions.get(route.params.id);

  const days = useMemo(() => {
    if (!sub) return [];
    const out: { date: string; skipped: boolean; status?: string }[] = [];
    for (let i = 0; i < PLANNING_DAYS; i++) {
      const date = addDaysStr(todayStr(), i);
      if (!isDeliveryDay(sub, date)) continue;
      const dayOrders = (sub.roundIds.length > 0 ? sub.roundIds : ['']).map((roundId) =>
        findGeneratedOrder(sub.id, date, roundId)
      );
      // A day counts as done only when every round of it has gone out.
      const statuses = dayOrders.filter(Boolean).map((o) => o!.status);
      out.push({
        date,
        skipped: isSkipped(sub.id, date),
        status:
          statuses.length > 0 && statuses.every((s) => s === 'delivered') ? 'delivered' : statuses[0],
      });
    }
    return out;
  }, [sub, customers]);

  if (!sub) return null;
  const customer = customers.find((c) => c.id === sub.customerId);

  const stop = async () => {
    const ok = await confirmAsync(
      'Stop this pack?',
      `${customer?.name ?? 'This customer'} will get no more deliveries. Anything already lined up for the coming days is cancelled. Past deliveries and bills are kept.`,
      { confirmLabel: 'Stop pack', destructive: true }
    );
    if (!ok) return;
    const cancelled = await stopSubscription(sub);
    notify(
      cancelled > 0
        ? `Pack stopped, and ${cancelled} upcoming deliver${cancelled === 1 ? 'y was' : 'ies were'} cancelled.`
        : 'Pack stopped.'
    );
    nav.goBack();
  };

  const resume = async () => {
    await setSubscriptionActive(sub, true);
    notify('Pack started again — deliveries resume from today.');
  };

  const rider = staff.find((s) => s.id === sub.riderId);
  const summary = monthSummary(sub);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <Card>
        <Text style={styles.customerName}>{customer?.name ?? 'Unknown customer'}</Text>
        {customer ? <Text style={styles.addr}>{customer.address}</Text> : null}
        <View style={styles.tagRow}>
          <Tag text={describeDays(sub.daysOfWeek)} tone="primary" />
          <Tag text={paymentLabel(sub.payment)} tone="muted" />
          {sub.active ? <Tag text="Active" tone="success" /> : <Tag text="Paused" tone="danger" />}
          {rider ? <Tag text={`🛵 ${rider.name}`} tone="muted" /> : null}
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>Each delivery</Text>
        {sub.lines.map((l, i) => (
          <View key={i} style={styles.lineRow}>
            <Text style={styles.lineQty}>{l.qty}×</Text>
            <Text style={styles.lineName}>{l.name}</Text>
            <Text style={styles.linePrice}>{formatMoney(l.price * l.qty)}</Text>
          </View>
        ))}
        <View style={[styles.lineRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Per delivery</Text>
          <Text style={styles.totalValue}>{formatMoney(orderTotal(sub.lines))}</Text>
        </View>
        {sub.notes ? <Text style={styles.notes}>📝 {sub.notes}</Text> : null}
      </Card>

      {/* This month's bill */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>{summary.monthLabel}</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary.delivered}</Text>
            <Text style={styles.summaryLabel}>Delivered</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary.scheduled}</Text>
            <Text style={styles.summaryLabel}>Still to come</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryNum, { color: colors.muted }]}>{summary.skipped}</Text>
            <Text style={styles.summaryLabel}>Skipped</Text>
          </View>
        </View>
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Billable this month</Text>
          <Text style={styles.billValue}>{formatMoney(summary.billable)}</Text>
        </View>
        <Text style={styles.billHint}>
          Skipped days are not counted — {summary.delivered + summary.scheduled} ×{' '}
          {formatMoney(summary.perDelivery)}
        </Text>
      </Card>

      {/* Skip planning */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>Upcoming days</Text>
        <Text style={styles.skipHint}>
          Tap a day to skip it when the customer is away. Nothing is delivered or billed for skipped
          days.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          {days.length === 0 ? (
            <Text style={styles.empty}>No delivery days in the next three weeks.</Text>
          ) : (
            days.map(({ date, skipped, status }) => {
              const done = status === 'delivered';
              return (
                <Pressable
                  key={date}
                  disabled={done}
                  onPress={() => (skipped ? unskipDay(sub, date) : skipDay(sub, date))}
                  style={({ pressed }) => [
                    styles.dayRow,
                    skipped && styles.dayRowSkipped,
                    pressed && !done && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name={
                      done
                        ? 'checkmark-circle'
                        : skipped
                        ? 'close-circle'
                        : 'ellipse-outline'
                    }
                    size={22}
                    color={done ? colors.success : skipped ? colors.danger : colors.border}
                  />
                  <Text style={[styles.dayLabel, skipped && styles.dayLabelSkipped]}>
                    {dateLabel(date)}
                  </Text>
                  {done ? (
                    <Tag text={ORDER_STATUS_LABELS.delivered} tone="success" />
                  ) : skipped ? (
                    <Tag text="Skipped" tone="danger" />
                  ) : (
                    <Text style={styles.dayAmount}>{formatMoney(orderTotal(sub.lines))}</Text>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </Card>

      {/* Everything you can do to this pack, in one place and clearly different
          from each other — the old form buried "stop" at the bottom of a long
          edit screen, next to a switch that seemed to do the same thing. */}
      <Text style={styles.actionsHeading}>Manage this pack</Text>

      {sub.active ? (
        <>
          <ActionCard
            icon="pause-circle-outline"
            title="Away for a few days"
            body="They are travelling or unwell. Pick the dates — you can undo it any time, and they are not charged for those days."
            onPress={() => nav.navigate('Pause', { subscriptionId: sub.id })}
          />
          <ActionCard
            icon="create-outline"
            title="Change what they get"
            body="Different box, different days, different price."
            onPress={() => nav.navigate('SubscriptionEdit', { id: sub.id })}
          />
          <ActionCard
            icon="stop-circle-outline"
            tone="danger"
            title="Stop this pack"
            body="They have left for good. Upcoming deliveries are cancelled straight away. Past deliveries and bills are kept."
            onPress={stop}
          />
        </>
      ) : (
        <>
          <View style={styles.pausedBanner}>
            <Ionicons name="pause-circle" size={20} color={colors.warning} />
            <Text style={styles.pausedText}>
              This pack is paused — no deliveries are being created for it.
            </Text>
          </View>
          <ActionCard
            icon="play-circle-outline"
            title="Start it again"
            body="Deliveries resume from today, on their usual days."
            onPress={resume}
          />
          <ActionCard
            icon="stop-circle-outline"
            tone="danger"
            title="Stop this pack"
            body="They have left for good. Past deliveries and bills are kept."
            onPress={stop}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  customerName: { fontSize: 19, fontWeight: '800', color: colors.text },
  addr: { fontSize: 14, color: colors.muted, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.md },
  lineQty: { width: 32, fontWeight: '800', color: colors.primaryDark, fontSize: 15 },
  lineName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  linePrice: { color: colors.text, fontWeight: '700', fontSize: 15 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 10 },
  totalLabel: { flex: 1, fontWeight: '800', color: colors.text, fontSize: 16 },
  totalValue: { fontWeight: '800', color: colors.primaryDark, fontSize: 18 },
  notes: { marginTop: spacing.md, color: colors.text, fontSize: 14 },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  summaryNum: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  summaryLabel: { fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  billLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  billValue: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  billHint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  skipHint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  empty: { color: colors.muted, fontStyle: 'italic', fontSize: 13 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginBottom: spacing.sm,
  },
  dayRowSkipped: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  dayLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  dayLabelSkipped: { color: colors.danger, textDecorationLine: 'line-through' },
  dayAmount: { fontSize: 14, fontWeight: '700', color: colors.muted },
  actionsHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  actionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  actionBody: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pausedText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.warning },
});
