import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Fab, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { Order, ORDER_STATUS_LABELS, SETTINGS_ID } from '../types';
import { paymentLabel } from '../utils/payments';
import { closedDaysOf, describeClosedDays, isClosedDay } from '../utils/calendar';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';
import { linesSummary, sortOrders, STATUS_TONES } from '../utils/orders';
import { productionCounts, totalBoxes } from '../utils/production';
import { effectiveRoundId, sortRounds } from '../utils/rounds';

type OrdersView = 'boxes' | 'customers';

export default function OrdersScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const orders = useCollection(db.orders);
  const customers = useCollection(db.customers);
  const staff = useCollection(db.staff);
  const rounds = sortRounds(useCollection(db.rounds).filter((r) => r.active));

  const [date, setDate] = useState(todayStr());
  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<OrdersView>('boxes');
  const [openBox, setOpenBox] = useState<string | null>(null);

  const canCreate = user?.role === 'owner' || user?.role === 'dispatch';
  const selectedRound = roundId ?? rounds[0]?.id ?? null;

  useCollection(db.settings);
  const closed = closedDaysOf(db.settings.get(SETTINGS_ID));
  const dayIsClosed = isClosedDay(date, closed);

  const dayOrders = useMemo(() => {
    const forDay = orders.filter((o) => o.date === date);
    if (!selectedRound) return forDay;
    return forDay.filter((o) => effectiveRoundId(o.roundId, rounds) === selectedRound);
  }, [orders, date, selectedRound, rounds]);

  const boxes = useMemo(() => productionCounts(dayOrders), [dayOrders]);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? 'Unknown customer';
  const riderName = (id?: string) => (id ? staff.find((s) => s.id === id)?.name : undefined);

  const cancelledCount = dayOrders.filter((o) => o.status === 'cancelled').length;

  return (
    <View style={styles.root}>
      {/* Day */}
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

      {dayIsClosed && (
        <View style={styles.closedBanner}>
          <Ionicons name="moon-outline" size={18} color={colors.danger} />
          <Text style={styles.closedBannerText}>
            Kitchen closed on {describeClosedDays(closed)} — no deliveries are created for this day.
          </Text>
        </View>
      )}

      {/* Round */}
      {rounds.length > 0 && (
        <View style={styles.roundRow}>
          {rounds.map((r) => {
            const on = selectedRound === r.id;
            const count = totalBoxes(
              productionCounts(
                orders.filter(
                  (o) => o.date === date && effectiveRoundId(o.roundId, rounds) === r.id
                )
              )
            );
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  setRoundId(r.id);
                  setOpenBox(null);
                }}
                style={[styles.roundChip, on && styles.roundChipOn]}
              >
                <Text style={[styles.roundName, on && styles.roundNameOn]}>{r.name}</Text>
                <Text style={[styles.roundCount, on && styles.roundNameOn]}>{count} boxes</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* View switch */}
      <View style={styles.viewRow}>
        {(['boxes', 'customers'] as OrdersView[]).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            style={[styles.viewChip, view === v && styles.viewChipOn]}
          >
            <Ionicons
              name={v === 'boxes' ? 'cube-outline' : 'people-outline'}
              size={15}
              color={view === v ? '#fff' : colors.text}
            />
            <Text style={[styles.viewText, view === v && styles.viewTextOn]}>
              {v === 'boxes' ? 'To cook' : 'By customer'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>
        {view === 'boxes' ? (
          boxes.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="Nothing to cook"
              subtitle={canCreate ? 'Tap + to add an order for this round.' : 'No orders for this round.'}
            />
          ) : (
            <>
              <View style={styles.totalCard}>
                <Text style={styles.totalNumber}>{totalBoxes(boxes)}</Text>
                <Text style={styles.totalLabel}>boxes in total</Text>
              </View>

              {boxes.map((box) => {
                const isOpen = openBox === box.key;
                return (
                  <View key={box.key} style={styles.boxCard}>
                    <Pressable
                      onPress={() => setOpenBox(isOpen ? null : box.key)}
                      style={styles.boxHeader}
                    >
                      <Text style={styles.boxQty}>{box.qty}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.boxName}>{box.name}</Text>
                        <Text style={styles.boxMeta}>
                          {box.entries.length} customer{box.entries.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={colors.muted}
                      />
                    </Pressable>

                    {isOpen && (
                      <View style={styles.boxBody}>
                        {box.entries.map(({ order, qty }) => (
                          <Pressable
                            key={order.id}
                            onPress={() => nav.navigate('OrderDetail', { id: order.id })}
                            style={({ pressed }) => [styles.entryRow, pressed && { opacity: 0.7 }]}
                          >
                            <Text style={styles.entryQty}>{qty}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.entryName}>{customerName(order.customerId)}</Text>
                              <View style={styles.entryTags}>
                                <Tag
                                  text={ORDER_STATUS_LABELS[order.status]}
                                  tone={STATUS_TONES[order.status]}
                                />
                                {riderName(order.riderId) ? (
                                  <Tag text={`🛵 ${riderName(order.riderId)}`} tone="muted" />
                                ) : order.status !== 'delivered' ? (
                                  <Tag text="No rider" tone="danger" />
                                ) : null}
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.border} />
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {cancelledCount > 0 && (
                <Text style={styles.footnote}>
                  {cancelledCount} cancelled or skipped for this round — not included above, so
                  nothing is cooked for them.
                </Text>
              )}
            </>
          )
        ) : dayOrders.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={`No orders for ${dateLabel(date).toLowerCase()}`}
            subtitle={canCreate ? 'Tap + to enter a new order.' : 'Orders will appear here.'}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {sortOrders(dayOrders).map((order: Order) => (
              <Pressable
                key={order.id}
                onPress={() => nav.navigate('OrderDetail', { id: order.id })}
                style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.orderTop}>
                  <Text style={styles.orderCustomer} numberOfLines={1}>
                    {customerName(order.customerId)}
                  </Text>
                  <Text style={styles.orderTotal}>{formatMoney(order.total)}</Text>
                </View>
                <Text style={styles.orderLines} numberOfLines={2}>
                  {linesSummary(order.lines)}
                </Text>
                <View style={styles.entryTags}>
                  <Tag text={ORDER_STATUS_LABELS[order.status]} tone={STATUS_TONES[order.status]} />
                  <Tag text={paymentLabel(order.payment)} tone={order.paid ? 'success' : 'muted'} />
                  {order.source === 'subscription' && <Tag text="Subscription" tone="info" />}
                  {riderName(order.riderId) ? (
                    <Tag text={`🛵 ${riderName(order.riderId)}`} tone="muted" />
                  ) : order.status !== 'cancelled' && order.status !== 'delivered' ? (
                    <Tag text="No rider" tone="danger" />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {canCreate && (
        <Fab onPress={() => nav.navigate('OrderNew', { date, roundId: selectedRound ?? undefined })} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  closedBannerText: { flex: 1, fontSize: 12, color: colors.danger, fontWeight: '600', lineHeight: 17 },
  roundRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  roundChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roundChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  roundName: { fontSize: 15, fontWeight: '800', color: colors.text },
  roundNameOn: { color: '#fff' },
  roundCount: { fontSize: 12, color: colors.muted, marginTop: 2 },
  viewRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  viewChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewChipOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  viewText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  viewTextOn: { color: '#fff' },
  totalCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  totalNumber: { fontSize: 40, fontWeight: '800', color: colors.primaryDark, lineHeight: 44 },
  totalLabel: { fontSize: 13, color: colors.primaryDark, fontWeight: '600' },
  boxCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  boxHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  boxQty: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primaryDark,
    minWidth: 46,
    textAlign: 'center',
  },
  boxName: { fontSize: 17, fontWeight: '700', color: colors.text },
  boxMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  boxBody: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryQty: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  entryName: { fontSize: 15, fontWeight: '700', color: colors.text },
  entryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  footnote: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: spacing.sm },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  orderCustomer: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  orderTotal: { fontSize: 16, fontWeight: '800', color: colors.primaryDark },
  orderLines: { fontSize: 13, color: colors.muted, marginTop: 4 },
});
