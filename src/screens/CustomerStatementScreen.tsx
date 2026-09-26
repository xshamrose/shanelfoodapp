import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Card, confirmAsync, Tag, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, uid, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, formatMoney, radius, spacing } from '../theme';
import { BILLING_CYCLE_LABELS, PaymentMethod } from '../types';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '../utils/payments';
import { accountStatementText, customerAccount } from '../utils/billing';
import { dateLabel, todayStr } from '../utils/dates';
import { callPhone } from './CustomersScreen';


export default function CustomerStatementScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerStatement'>>();
  const { user } = useAuth();
  const customers = useCollection(db.customers);
  const orders = useCollection(db.orders);
  const bills = useCollection(db.bills);
  const payments = useCollection(db.payments);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const customer = customers.find((c) => c.id === route.params.customerId);
  const account = useMemo(
    () => (customer ? customerAccount(customer, orders, bills, payments) : undefined),
    [customer, orders, bills, payments]
  );

  if (!customer || !account) return null;

  const theirBills = bills
    .filter((b) => b.customerId === customer.id)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const theirPayments = payments
    .filter((p) => p.customerId === customer.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const recordPayment = async (value: number) => {
    if (!user) return;
    if (!value || isNaN(value) || value <= 0) return notify('Enter how much they paid.');
    await db.payments.upsert({
      id: uid(),
      customerId: customer.id,
      date: todayStr(),
      amount: value,
      method,
      recordedBy: user.id,
      createdAt: new Date().toISOString(),
    });
    setAmount('');
  };

  const removePayment = async (id: string, isCollection: boolean) => {
    if (isCollection) {
      return notify(
        'This came from a rider collecting cash on a delivery. Change it on the order itself so the two stay in step.'
      );
    }
    const ok = await confirmAsync('Remove this payment?', 'The balance will go back up.');
    if (ok) await db.payments.remove(id);
  };

  const removeBill = async (id: string) => {
    const ok = await confirmAsync('Delete this bill?', 'Those deliveries will need billing again.');
    if (ok) await db.bills.remove(id);
  };

  const share = async () => {
    const text = accountStatementText(account, bills, payments, CURRENCY);
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(text);
        window.alert('Statement copied — paste it into WhatsApp or SMS.');
      } catch {
        window.alert(text);
      }
      return;
    }
    await Share.share({ message: text });
  };

  const owes = account.balance > 0;
  const credit = account.balance < 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      {/* Balance */}
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Text style={styles.name}>{customer.name}</Text>
        <Tag text={BILLING_CYCLE_LABELS[account.cycle]} tone="info" />
        <Text style={styles.balanceLabel}>
          {owes ? 'Balance due' : credit ? 'In credit' : 'Balance'}
        </Text>
        <Text
          style={[
            styles.balanceValue,
            { color: owes ? colors.danger : credit ? colors.success : colors.text },
          ]}
        >
          {formatMoney(Math.abs(account.balance))}
        </Text>
        {account.partlyPaid && (
          <Text style={styles.partHint}>
            {formatMoney(account.paid)} of {formatMoney(account.charged)} paid so far
          </Text>
        )}
        {!account.partlyPaid && account.balance === 0 && account.charged > 0 && (
          <Text style={styles.partHint}>Fully settled</Text>
        )}
        {customer.phone ? (
          <Pressable onPress={() => callPhone(customer.phone)} style={styles.callBtn}>
            <Ionicons name="call" size={16} color={colors.success} />
            <Text style={styles.callText}>{customer.phone}</Text>
          </Pressable>
        ) : null}
      </Card>

      {/* Deliveries waiting to be billed */}
      {account.uninvoiced.count > 0 && (
        <Card style={[styles.attention, { marginTop: spacing.md }]}>
          <View style={styles.attentionHeader}>
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <Text style={styles.attentionTitle}>
              {account.uninvoiced.count} deliver{account.uninvoiced.count === 1 ? 'y' : 'ies'} not billed
              yet
            </Text>
          </View>
          <Text style={styles.attentionBody}>
            {account.uninvoiced.earliest === account.uninvoiced.latest
              ? dateLabel(account.uninvoiced.earliest!)
              : `${account.uninvoiced.earliest} to ${account.uninvoiced.latest}`}
            {' · '}
            at menu prices that would be {formatMoney(account.uninvoiced.suggested)}, but you decide
            the figure.
          </Text>
          <Button
            title="Raise a bill"
            icon="document-text-outline"
            onPress={() => nav.navigate('BillNew', { customerId: customer.id })}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      )}

      {/* Record a payment — any amount, so part payments just work */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>Record a payment</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMethod(m)}
              style={[styles.methodChip, method === m && styles.methodChipOn]}
            >
              <Text style={[styles.methodText, method === m && styles.methodTextOn]}>
                {PAYMENT_METHOD_LABELS[m]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.payRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder={`${CURRENCY} amount`}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={styles.input}
          />
          <Button
            title="Record"
            onPress={() => recordPayment(Number(amount))}
            style={{ paddingVertical: 12, paddingHorizontal: spacing.lg }}
          />
        </View>
        {owes && (
          <Pressable onPress={() => recordPayment(account.balance)} hitSlop={6}>
            <Text style={styles.fullLink}>Paid the full {formatMoney(account.balance)}</Text>
          </Pressable>
        )}
        <Text style={styles.partNote}>
          Enter any amount — a smaller figure is recorded as a part payment and the rest stays owing.
        </Text>
      </Card>

      {/* Bills */}
      {account.cycle !== 'daily' && (
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>Bills raised</Text>
            <Pressable onPress={() => nav.navigate('BillNew', { customerId: customer.id })} hitSlop={8}>
              <Text style={styles.addLink}>+ New bill</Text>
            </Pressable>
          </View>
          {theirBills.length === 0 ? (
            <Text style={styles.empty}>No bills raised yet.</Text>
          ) : (
            theirBills.map((b) => (
              <View key={b.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyMain}>
                    {b.periodStart} to {b.periodEnd}
                  </Text>
                  {b.note ? <Text style={styles.historyMeta}>{b.note}</Text> : null}
                </View>
                <Text style={styles.historyAmount}>{formatMoney(b.amount)}</Text>
                <Pressable onPress={() => removeBill(b.id)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </Card>
      )}

      {/* Payments received */}
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionLabel}>Payments received</Text>
        {theirPayments.length === 0 ? (
          <Text style={styles.empty}>Nothing received yet.</Text>
        ) : (
          theirPayments.map((p) => {
            const fromCollection = !!p.orderId;
            return (
              <View key={p.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyMain}>{dateLabel(p.date)}</Text>
                  <Text style={styles.historyMeta}>
                    {fromCollection ? 'Cash collected on delivery' : PAYMENT_METHOD_LABELS[p.method]}
                  </Text>
                </View>
                <Text style={[styles.historyAmount, { color: colors.success }]}>
                  {formatMoney(p.amount)}
                </Text>
                <Pressable onPress={() => removePayment(p.id, fromCollection)} hitSlop={8}>
                  <Ionicons
                    name={fromCollection ? 'lock-closed-outline' : 'close-circle'}
                    size={20}
                    color={fromCollection ? colors.muted : colors.danger}
                  />
                </Pressable>
              </View>
            );
          })
        )}
      </Card>

      {/* Daily customers: what they were charged for */}
      {account.cycle === 'daily' && account.deliveries > 0 && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionLabel}>Charged for</Text>
          <View style={styles.historyRow}>
            <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>
              {account.deliveries} deliver{account.deliveries === 1 ? 'y' : 'ies'} completed
            </Text>
            <Text style={styles.historyAmount}>{formatMoney(account.charged)}</Text>
          </View>
          <Text style={styles.partNote}>
            Pays per delivery, so each completed delivery is charged automatically.
          </Text>
        </Card>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button
          title={Platform.OS === 'web' ? 'Copy statement' : 'Send statement'}
          variant="secondary"
          icon="share-social-outline"
          onPress={share}
        />
      </View>
      <Text style={styles.hint}>
        Sending opens your own WhatsApp or SMS — nothing is sent without you choosing to.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  name: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  balanceValue: { fontSize: 34, fontWeight: '800', marginTop: 2 },
  partHint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  callText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  attention: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  attentionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attentionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.warning },
  attentionBody: { fontSize: 13, color: colors.warning, marginTop: 6, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLink: { color: colors.primaryDark, fontWeight: '700', fontSize: 13, marginBottom: spacing.sm },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodText: { fontWeight: '700', fontSize: 13, color: colors.text },
  methodTextOn: { color: '#fff' },
  payRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  fullLink: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  partNote: { fontSize: 11, color: colors.muted, marginTop: spacing.sm, lineHeight: 15 },
  empty: { color: colors.muted, fontStyle: 'italic', fontSize: 13 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyMain: { fontSize: 14, fontWeight: '700', color: colors.text },
  historyMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  historyAmount: { fontSize: 15, fontWeight: '800', color: colors.text },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.md, fontStyle: 'italic' },
});
