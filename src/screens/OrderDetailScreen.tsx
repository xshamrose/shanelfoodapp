import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, confirmAsync, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { saveOrder } from '../data/actions';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, spacing } from '../theme';
import { NEXT_STATUS, ORDER_STATUS_LABELS } from '../types';
import { isCashMethod, paymentLabel } from '../utils/payments';
import { dateLabel } from '../utils/dates';
import { STATUS_TONES } from '../utils/orders';
import { skipDay } from '../utils/subscriptions';
import { callPhone, openInMaps } from './CustomersScreen';

export default function OrderDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'OrderDetail'>>();
  const { user } = useAuth();
  useCollection(db.orders); // re-render on changes
  const staff = useCollection(db.staff);

  const order = db.orders.get(route.params.id);
  if (!order || !user) return null;
  const customer = db.customers.get(order.customerId);
  // A generated delivery's id embeds its subscription, so match on the prefix
  // rather than rebuilding the exact id (which also needs the round).
  const subscription =
    order.source === 'subscription'
      ? db.subscriptions.getAll().find((s) => order.id.startsWith(`sub-${s.id}-`))
      : undefined;

  const canManage = user.role === 'owner' || user.role === 'dispatch';
  const canMarkPaid = canManage || user.role === 'accountant';
  const isAssignedRider = user.role === 'rider' && order.riderId === user.id;
  const riders = staff.filter((s) => s.active && s.role === 'rider');

  const advance = async () => {
    const step = NEXT_STATUS[order.status];
    if (!step) return;
    if (step.next !== 'delivered') {
      await db.orders.upsert({ ...order, status: step.next });
      return;
    }
    // Delivering a cash order is also the moment cash changes hands — ask, so it
    // never gets recorded as delivered-but-unpaid by accident.
    let paid = order.paid;
    if (isCashMethod(order.payment) && !paid) {
      paid = await confirmAsync(
        'Cash collected?',
        `Was ${formatMoney(order.total)} collected from the customer?`,
        { confirmLabel: 'Yes, collected', destructive: false }
      );
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

  const cancel = async () => {
    const ok = await confirmAsync('Cancel order?', 'The order will be kept in the list as cancelled.', {
      confirmLabel: 'Cancel order',
    });
    if (ok) await saveOrder({ ...order, status: 'cancelled' }, user.id);
  };

  /**
   * The common subscription interruption: the customer rings to say they are
   * away. This cancels today's delivery and records the skip in one tap, so the
   * day is neither delivered nor billed.
   */
  const skipToday = async () => {
    if (!subscription) return;
    const ok = await confirmAsync(
      'Skip this delivery?',
      `${customer?.name ?? 'This customer'} will not be delivered to or billed for ${dateLabel(
        order.date
      ).toLowerCase()}.`
    );
    if (ok) await skipDay(subscription, order.date);
  };

  const togglePaid = () => saveOrder({ ...order, paid: !order.paid }, user.id);
  const assignRider = (riderId?: string) => db.orders.upsert({ ...order, riderId });

  const step = NEXT_STATUS[order.status];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      {/* Status + date */}
      <View style={styles.tagRow}>
        <Tag text={ORDER_STATUS_LABELS[order.status]} tone={STATUS_TONES[order.status]} />
        <Tag text={dateLabel(order.date)} tone="muted" />
        {order.source === 'subscription' && <Tag text="Subscription" tone="info" />}
      </View>

      {/* Customer */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.customerName}>{customer?.name ?? 'Unknown customer'}</Text>
        {customer ? (
          <>
            <Text style={styles.addr}>
              {customer.address}
              {customer.landmark ? ` · ${customer.landmark}` : ''}
            </Text>
            {customer.notes ? <Text style={styles.notes}>“{customer.notes}”</Text> : null}
            <View style={styles.contactRow}>
              {customer.phone ? (
                <Pressable onPress={() => callPhone(customer.phone)} style={styles.contactBtn}>
                  <Ionicons name="call" size={18} color={colors.success} />
                  <Text style={styles.contactText}>Call</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => openInMaps(customer)} style={styles.contactBtn}>
                <Ionicons name="navigate" size={18} color={colors.info} />
                <Text style={styles.contactText}>Navigate</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </Card>

      {/* Items */}
      <Card style={{ marginTop: spacing.md }}>
        {order.lines.map((l, i) => (
          <View key={i} style={styles.lineRow}>
            <Text style={styles.lineQty}>{l.qty}×</Text>
            <Text style={styles.lineName}>{l.name}</Text>
            <Text style={styles.linePrice}>{formatMoney(l.price * l.qty)}</Text>
          </View>
        ))}
        <View style={[styles.lineRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(order.total)}</Text>
        </View>
        {order.notes ? <Text style={styles.orderNotes}>📝 {order.notes}</Text> : null}
      </Card>

      {/* Payment */}
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.payRow}>
          <View>
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 6 }}>
              <Tag text={paymentLabel(order.payment)} tone="muted" />
              <Tag text={order.paid ? 'Paid' : 'Not paid'} tone={order.paid ? 'success' : 'danger'} />
            </View>
          </View>
          {canMarkPaid && (
            <Button
              title={order.paid ? 'Mark unpaid' : 'Mark paid'}
              variant="secondary"
              onPress={togglePaid}
            />
          )}
        </View>
      </Card>

      {/* Rider */}
      {canManage && order.status !== 'delivered' && order.status !== 'cancelled' ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionLabel}>Rider</Text>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => assignRider(undefined)}
              style={[styles.chip, !order.riderId && styles.chipOn]}
            >
              <Text style={[styles.chipText, !order.riderId && styles.chipTextOn]}>Unassigned</Text>
            </Pressable>
            {riders.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => assignRider(r.id)}
                style={[styles.chip, order.riderId === r.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, order.riderId === r.id && styles.chipTextOn]}>{r.name}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : order.riderId ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionLabel}>Rider</Text>
          <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>
            {staff.find((s) => s.id === order.riderId)?.name ?? '—'}
          </Text>
        </Card>
      ) : null}

      {/* Actions */}
      <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
        {step && (canManage || (isAssignedRider && order.status === 'out')) ? (
          <Button title={step.label} icon="arrow-forward" onPress={advance} />
        ) : null}
        {canManage && (
          <Button
            title="Change items or day"
            variant="secondary"
            icon="create-outline"
            onPress={() => nav.navigate('OrderNew', { orderId: order.id })}
          />
        )}
        {canManage && subscription && order.status !== 'delivered' && order.status !== 'cancelled' ? (
          <Button
            title="Customer away — skip this day"
            variant="secondary"
            icon="calendar-clear-outline"
            onPress={skipToday}
          />
        ) : null}
        {canManage && order.status !== 'delivered' && order.status !== 'cancelled' ? (
          <Button title="Cancel order" variant="danger" icon="close" onPress={cancel} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customerName: { fontSize: 18, fontWeight: '800', color: colors.text },
  addr: { fontSize: 14, color: colors.muted, marginTop: 4 },
  notes: { fontSize: 13, color: colors.text, marginTop: 6, fontStyle: 'italic' },
  contactRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  contactText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.md },
  lineQty: { width: 32, fontWeight: '800', color: colors.primaryDark, fontSize: 15 },
  lineName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  linePrice: { color: colors.text, fontWeight: '700', fontSize: 15 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 10 },
  totalLabel: { flex: 1, fontWeight: '800', color: colors.text, fontSize: 16 },
  totalValue: { fontWeight: '800', color: colors.primaryDark, fontSize: 18 },
  orderNotes: { marginTop: spacing.md, color: colors.text, fontSize: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
});
