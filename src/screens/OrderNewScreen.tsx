import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Card, confirmAsync, SearchBar, Tag, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { saveOrder } from '../data/actions';
import { db, uid, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, formatMoney, radius, spacing } from '../theme';
import { Customer, OrderLine, PaymentMethod, SETTINGS_ID } from '../types';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '../utils/payments';
import { closedDaysOf, describeClosedDays, isClosedDay } from '../utils/calendar';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';
import { orderTotal } from '../utils/orders';
import { sortRounds } from '../utils/rounds';

export default function OrderNewScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'OrderNew'>>();
  const { user } = useAuth();
  const customers = useCollection(db.customers);
  const menu = useCollection(db.menu);
  const staff = useCollection(db.staff);
  const riders = staff.filter((s) => s.active && s.role === 'rider');

  // The same form both creates and edits, so a customer who rings back to change
  // their order is a quick edit rather than a cancel-and-retype.
  const existing = route.params?.orderId ? db.orders.get(route.params.orderId) : undefined;

  const [customer, setCustomer] = useState<Customer | null>(
    existing ? db.customers.get(existing.customerId) ?? null : null
  );
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(existing?.date ?? route.params?.date ?? todayStr());
  const rounds = sortRounds(useCollection(db.rounds).filter((r) => r.active));
  const [roundId, setRoundId] = useState<string | undefined>(
    existing?.roundId ?? route.params?.roundId ?? rounds[0]?.id
  );
  useCollection(db.settings);
  const closed = closedDaysOf(db.settings.get(SETTINGS_ID));
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    existing?.lines.forEach((l) => {
      if (l.menuItemId) initial[l.menuItemId] = l.qty;
    });
    return initial;
  });
  const [customLines, setCustomLines] = useState<OrderLine[]>(
    existing?.lines.filter((l) => !l.menuItemId) ?? []
  );
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>(existing?.payment ?? 'cash');
  const [riderId, setRiderId] = useState<string | undefined>(existing?.riderId);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    const found = q
      ? sorted.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      : sorted;
    return found.slice(0, 6);
  }, [customers, search]);

  const availableMenu = useMemo(
    () => [...menu.filter((m) => m.available)].sort((a, b) => a.name.localeCompare(b.name)),
    [menu]
  );

  const lines: OrderLine[] = useMemo(() => {
    const menuLines: OrderLine[] = availableMenu
      .filter((m) => (qty[m.id] ?? 0) > 0)
      .map((m) => ({ menuItemId: m.id, name: m.name, price: m.price, qty: qty[m.id] }));
    return [...menuLines, ...customLines];
  }, [availableMenu, qty, customLines]);

  const total = orderTotal(lines);

  const bump = (id: string, delta: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));

  const addCustom = () => {
    const price = Number(customPrice);
    if (!customName.trim() || isNaN(price) || price < 0) {
      notify('Give the custom item a name and a valid price.');
      return;
    }
    setCustomLines((l) => [...l, { name: customName.trim(), price, qty: 1 }]);
    setCustomName('');
    setCustomPrice('');
  };

  const save = async () => {
    if (!customer) return notify('Pick a customer first.');
    if (lines.length === 0) return notify('Add at least one item to the order.');
    // A one-off order on a closed day is possible (special catering), but it
    // should never happen by accident.
    if (isClosedDay(date, closed)) {
      const ok = await confirmAsync(
        'Kitchen is closed that day',
        `${dateLabel(date)} is a closed day (${describeClosedDays(closed)}). Add this order anyway?`
      );
      if (!ok) return;
    }
    if (existing) {
      // Correcting an order that already went out is allowed — mistakes need
      // fixing — but it changes what the customer is charged, so ask first.
      if (existing.status === 'delivered') {
        const ok = await confirmAsync(
          'This delivery already went out',
          `Changing it will alter what ${customer.name} is charged${
            existing.total !== total
              ? `, from ${formatMoney(existing.total)} to ${formatMoney(total)}`
              : ''
          }. Save the change?`
        );
        if (!ok) return;
      }
      // Keep everything about how the delivery has progressed — status, who took
      // it, whether cash was collected — and change only what was edited.
      await saveOrder(
        {
          ...existing,
          customerId: customer.id,
          roundId,
          lines,
          total,
          payment,
          riderId,
          notes: notes.trim() || undefined,
          date,
        },
        user?.id
      );
      nav.goBack();
      return;
    }

    await db.orders.upsert({
      id: uid(),
      customerId: customer.id,
      roundId,
      lines,
      total,
      status: 'new',
      payment,
      paid: false,
      riderId,
      notes: notes.trim() || undefined,
      date,
      source: 'manual',
      createdAt: new Date().toISOString(),
    });
    nav.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {/* Customer */}
        <Text style={styles.section}>Customer</Text>
        {customer ? (
          <Card style={styles.selectedCustomer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerAddr} numberOfLines={1}>
                {customer.address}
              </Text>
            </View>
            <Pressable onPress={() => setCustomer(null)} hitSlop={8}>
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Search customer name or phone" />
            <View style={{ gap: spacing.sm }}>
              {matches.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCustomer(c)}
                  style={({ pressed }) => [styles.customerRow, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.customerName}>{c.name}</Text>
                  <Text style={styles.customerAddr} numberOfLines={1}>
                    {c.address}
                  </Text>
                </Pressable>
              ))}
              {matches.length === 0 && (
                <Text style={styles.hint}>No matches — add the customer in the Customers tab first.</Text>
              )}
            </View>
          </>
        )}

        {/* Delivery day */}
        <Text style={styles.section}>Deliver on</Text>
        <View style={styles.chipRow}>
          {[todayStr(), addDaysStr(todayStr(), 1)].map((d) => (
            <Pressable key={d} onPress={() => setDate(d)} style={[styles.chip, date === d && styles.chipOn]}>
              <Text style={[styles.chipText, date === d && styles.chipTextOn]}>{dateLabel(d)}</Text>
            </Pressable>
          ))}
          {date !== todayStr() && date !== addDaysStr(todayStr(), 1) && <Tag text={dateLabel(date)} tone="primary" />}
        </View>

        {/* Round */}
        {rounds.length > 0 && (
          <>
            <Text style={styles.section}>Which round</Text>
            <View style={styles.chipRow}>
              {rounds.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => setRoundId(r.id)}
                  style={[styles.chip, roundId === r.id && styles.chipOn]}
                >
                  <Text style={[styles.chipText, roundId === r.id && styles.chipTextOn]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Items */}
        <Text style={styles.section}>Items</Text>
        <View style={{ gap: spacing.sm }}>
          {availableMenu.map((m) => {
            const count = qty[m.id] ?? 0;
            return (
              <View key={m.id} style={[styles.menuRow, count > 0 && styles.menuRowOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{m.name}</Text>
                  <Text style={styles.menuPrice}>{formatMoney(m.price)}</Text>
                </View>
                {count > 0 ? (
                  <View style={styles.stepper}>
                    <Pressable onPress={() => bump(m.id, -1)} style={styles.stepBtn} hitSlop={6}>
                      <Ionicons name="remove" size={20} color={colors.primaryDark} />
                    </Pressable>
                    <Text style={styles.stepCount}>{count}</Text>
                    <Pressable onPress={() => bump(m.id, 1)} style={styles.stepBtn} hitSlop={6}>
                      <Ionicons name="add" size={20} color={colors.primaryDark} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => bump(m.id, 1)} style={styles.addBtn} hitSlop={6}>
                    <Ionicons name="add" size={22} color="#fff" />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Custom line */}
        <Text style={styles.section}>Custom item (optional)</Text>
        {customLines.map((l, i) => (
          <View key={i} style={styles.customLine}>
            <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>
              {l.name} — {formatMoney(l.price)}
            </Text>
            <Pressable onPress={() => setCustomLines((cl) => cl.filter((_, j) => j !== i))} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </Pressable>
          </View>
        ))}
        <View style={styles.customRow}>
          <TextInput
            value={customName}
            onChangeText={setCustomName}
            placeholder="e.g. Party tray"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 2 }]}
          />
          <TextInput
            value={customPrice}
            onChangeText={setCustomPrice}
            placeholder={CURRENCY}
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable onPress={addCustom} style={styles.addBtn}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Payment */}
        <Text style={styles.section}>Payment</Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((p) => (
            <Pressable key={p} onPress={() => setPayment(p)} style={[styles.chip, payment === p && styles.chipOn]}>
              <Text style={[styles.chipText, payment === p && styles.chipTextOn]}>{PAYMENT_METHOD_LABELS[p]}</Text>
            </Pressable>
          ))}
        </View>

        {/* Rider */}
        <Text style={styles.section}>Assign rider (optional)</Text>
        <View style={styles.chipRow}>
          <Pressable onPress={() => setRiderId(undefined)} style={[styles.chip, !riderId && styles.chipOn]}>
            <Text style={[styles.chipText, !riderId && styles.chipTextOn]}>Later</Text>
          </Pressable>
          {riders.map((r) => (
            <Pressable key={r.id} onPress={() => setRiderId(r.id)} style={[styles.chip, riderId === r.id && styles.chipOn]}>
              <Text style={[styles.chipText, riderId === r.id && styles.chipTextOn]}>{r.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* Notes */}
        <Text style={styles.section}>Order notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. less spicy, deliver before 1pm"
          placeholderTextColor={colors.muted}
          style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
          multiline
        />
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatMoney(total)}</Text>
        </View>
        <Button
          title={existing ? 'Save changes' : 'Create order'}
          icon="checkmark"
          onPress={save}
          style={{ flex: 1, marginLeft: spacing.lg }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  selectedCustomer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  customerRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  customerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  customerAddr: { fontSize: 13, color: colors.muted, marginTop: 2 },
  changeLink: { color: colors.primaryDark, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, fontStyle: 'italic', padding: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text, fontSize: 14 },
  chipTextOn: { color: '#fff' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  menuRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  menuName: { fontSize: 15, fontWeight: '700', color: colors.text },
  menuPrice: { fontSize: 13, color: colors.primaryDark, fontWeight: '600', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: { fontSize: 17, fontWeight: '800', color: colors.text, minWidth: 22, textAlign: 'center' },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customLine: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  customRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  footerTotal: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
});
