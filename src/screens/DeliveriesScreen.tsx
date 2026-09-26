import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, confirmAsync, EmptyState, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { saveOrder } from '../data/actions';
import { isCashMethod } from '../utils/payments';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { Order, ORDER_STATUS_LABELS } from '../types';
import { todayStr } from '../utils/dates';
import { linesSummary, STATUS_TONES } from '../utils/orders';
import { callPhone, openInMaps } from './CustomersScreen';

export default function DeliveriesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const orders = useCollection(db.orders);
  const customers = useCollection(db.customers);

  const today = todayStr();
  const mine = useMemo(
    () =>
      orders.filter(
        (o) => o.riderId === user?.id && o.date === today && o.status !== 'cancelled'
      ),
    [orders, user, today]
  );
  const toDeliver = mine.filter((o) => o.status !== 'delivered');
  const done = mine.filter((o) => o.status === 'delivered');

  const markDelivered = async (order: Order) => {
    if (!user) return;
    let paid = order.paid;
    if (isCashMethod(order.payment) && !order.paid) {
      const collected = await confirmAsync(
        'Cash collected?',
        `Did you collect ${formatMoney(order.total)} from the customer?`,
        { confirmLabel: 'Yes, collected', destructive: false }
      );
      paid = collected;
    }
    await saveOrder(
      {
        ...order,
        status: 'delivered',
        paid,
        deliveredAt: new Date().toISOString(),
        deliveredBy: user.id,
      },
      user.id
    );
  };

  const card = (order: Order, active: boolean) => {
    const customer = customers.find((c) => c.id === order.customerId);
    return (
      <Pressable
        key={order.id}
        onPress={() => nav.navigate('OrderDetail', { id: order.id })}
        style={({ pressed }) => [styles.card, !active && styles.cardDone, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.customer}>{customer?.name ?? 'Unknown customer'}</Text>
          <Tag text={ORDER_STATUS_LABELS[order.status]} tone={STATUS_TONES[order.status]} />
        </View>
        <Text style={styles.addr}>
          {customer?.address}
          {customer?.landmark ? ` · ${customer.landmark}` : ''}
        </Text>
        <Text style={styles.items} numberOfLines={1}>
          {linesSummary(order.lines)}
        </Text>

{(() => {
          const needsCash = isCashMethod(order.payment) && !order.paid;
          const label = needsCash
            ? `Collect ${formatMoney(order.total)} in cash`
            : isCashMethod(order.payment)
            ? `Cash collected · ${formatMoney(order.total)}`
            : order.payment === 'transfer'
            ? 'On monthly bill — collect nothing'
            : 'Paid online — collect nothing';
          return (
            <View style={styles.collectBar}>
              <Ionicons
                name={needsCash ? 'cash-outline' : 'checkmark-circle-outline'}
                size={18}
                color={needsCash ? colors.warning : colors.success}
              />
              <Text style={[styles.collectText, !needsCash && { color: colors.success }]}>{label}</Text>
            </View>
          );
        })()}

        {active && (
          <View style={styles.actionRow}>
            {customer?.phone ? (
              <Pressable onPress={() => callPhone(customer.phone)} style={styles.roundBtn} hitSlop={6}>
                <Ionicons name="call" size={20} color={colors.success} />
              </Pressable>
            ) : null}
            {customer ? (
              <Pressable onPress={() => openInMaps(customer)} style={styles.roundBtn} hitSlop={6}>
                <Ionicons name="navigate" size={20} color={colors.info} />
              </Pressable>
            ) : null}
            <Button
              title="Mark delivered"
              icon="checkmark-done"
              onPress={() => markDelivered(order)}
              style={{ flex: 1, paddingVertical: 12 }}
            />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      {mine.length === 0 ? (
        <EmptyState
          icon="bicycle-outline"
          title="No deliveries today"
          subtitle="When dispatch assigns you an order, it will show up here."
        />
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            To deliver ({toDeliver.length})
          </Text>
          <View style={{ gap: spacing.md }}>{toDeliver.map((o) => card(o, true))}</View>
          {done.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Done ({done.length})</Text>
              <View style={{ gap: spacing.md }}>{done.map((o) => card(o, false))}</View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardDone: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  customer: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 },
  addr: { fontSize: 14, color: colors.muted, marginTop: 6 },
  items: { fontSize: 13, color: colors.text, marginTop: 6 },
  collectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.md,
  },
  collectText: { fontWeight: '700', color: colors.warning, fontSize: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
