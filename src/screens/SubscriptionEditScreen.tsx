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
  TextInput,
  View,
} from 'react-native';
import { Button, Card, confirmAsync, SearchBar, notify } from '../components/ui';
import { db, uid, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, formatMoney, radius, spacing } from '../theme';
import {
  BillingCycle,
  Customer,
  OrderLine,
  PaymentMethod,
  SETTINGS_ID,
  Weekday,
  WEEKDAY_SHORT,
} from '../types';
import { closedDaysOf, describeClosedDays, openWeekdays } from '../utils/calendar';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '../utils/payments';
import { dateLabel, todayStr } from '../utils/dates';
import { orderTotal } from '../utils/orders';
import { sortRounds } from '../utils/rounds';
import { generateSubscriptionOrders } from '../utils/subscriptions';

/**
 * Day presets, filtered against the days the kitchen is shut.
 *
 * "Every open day" replaces a literal "Every day" because offering Sunday when
 * the kitchen is closed on Sundays only invites mistakes.
 */
function dayPresets(closed: Weekday[]): { label: string; days: Weekday[] }[] {
  const open = (days: Weekday[]) => days.filter((d) => !closed.includes(d));
  return [
    { label: 'Mon–Sat', days: open([1, 2, 3, 4, 5, 6]) },
    { label: 'Mon–Fri', days: open([1, 2, 3, 4, 5]) },
    { label: 'Every open day', days: openWeekdays(closed) },
  ].filter((p) => p.days.length > 0);
}

export default function SubscriptionEditScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'SubscriptionEdit'>>();
  const existing = route.params?.id ? db.subscriptions.get(route.params.id) : undefined;

  const customers = useCollection(db.customers);
  const menu = useCollection(db.menu);
  const staff = useCollection(db.staff);
  const riders = staff.filter((s) => s.active && s.role === 'rider');

  const [customer, setCustomer] = useState<Customer | null>(
    existing ? customers.find((c) => c.id === existing.customerId) ?? null : null
  );
  const [search, setSearch] = useState('');
  useCollection(db.settings);
  const closed = closedDaysOf(db.settings.get(SETTINGS_ID));
  const presets = dayPresets(closed);

  // A new pack defaults to Mon–Sat, which is how Shanel Foods sells them.
  const [days, setDays] = useState<Weekday[]>(
    existing?.daysOfWeek ?? presets[0]?.days ?? [1, 2, 3, 4, 5, 6]
  );
  const rounds = sortRounds(useCollection(db.rounds).filter((r) => r.active));
  const [roundIds, setRoundIds] = useState<string[]>(
    existing?.roundIds?.length ? existing.roundIds : rounds.slice(0, 1).map((r) => r.id)
  );
  const [payment, setPayment] = useState<PaymentMethod>(existing?.payment ?? 'cash');
  // The pack's billing cycle lives on the customer, but it belongs in this form:
  // "monthly pack" is one decision, not two screens.
  const [cycle, setCycle] = useState<BillingCycle>(customer?.billingCycle ?? 'monthly');
  const [packAmount, setPackAmount] = useState(
    existing?.packAmount !== undefined ? String(existing.packAmount) : ''
  );
  const [riderId, setRiderId] = useState<string | undefined>(existing?.riderId);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // Pausing and stopping live on the pack screen; this form preserves the
  // pack's current state rather than offering a second way to change it.
  const active = existing?.active ?? true;

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

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    return (q ? sorted.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : sorted).slice(0, 6);
  }, [customers, search]);

  const availableMenu = useMemo(
    () => [...menu.filter((m) => m.available)].sort((a, b) => a.name.localeCompare(b.name)),
    [menu]
  );

  const lines: OrderLine[] = useMemo(() => {
    const menuLines = availableMenu
      .filter((m) => (qty[m.id] ?? 0) > 0)
      .map((m) => ({ menuItemId: m.id, name: m.name, price: m.price, qty: qty[m.id] }));
    return [...menuLines, ...customLines];
  }, [availableMenu, qty, customLines]);

  const perDay = orderTotal(lines);

  /** Roughly how many deliveries a cycle contains, to sanity-check a pack price. */
  const deliveriesPerCycle = useMemo(() => {
    const perWeek = days.filter((d) => !closed.includes(d)).length * Math.max(1, roundIds.length);
    return cycle === 'weekly' ? perWeek : Math.round(perWeek * 4.33);
  }, [days, closed, roundIds, cycle]);
  const bump = (id: string, delta: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));

  const toggleDay = (d: Weekday) => {
    if (closed.includes(d)) return; // kitchen is shut, nothing to deliver
    setDays((current) => (current.includes(d) ? current.filter((x) => x !== d) : [...current, d]));
  };

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
    if (lines.length === 0) return notify('Add at least one item they receive.');
    if (days.length === 0) return notify('Choose which days they get a delivery.');
    if (roundIds.length === 0) return notify('Choose morning, evening, or both.');
    if (cycle !== 'daily' && packAmount.trim()) {
      const value = Number(packAmount);
      if (isNaN(value) || value <= 0) return notify('Enter a valid pack price, or leave it blank.');
    }

    // Keep the customer's billing cycle in step with the pack being sold.
    if ((customer.billingCycle ?? 'daily') !== cycle) {
      await db.customers.upsert({ ...customer, billingCycle: cycle });
    }
    await db.subscriptions.upsert({
      id: existing?.id ?? uid(),
      customerId: customer.id,
      lines,
      daysOfWeek: [...days].sort((a, b) => a - b),
      roundIds,
      payment,
      // Only packs have an agreed period price; daily customers pay per delivery.
      packAmount: cycle === 'daily' || !packAmount.trim() ? undefined : Number(packAmount),
      riderId,
      notes: notes.trim() || undefined,
      startDate: existing?.startDate ?? todayStr(),
      endDate: existing?.endDate,
      active,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    // Fill in the coming week straight away so dispatch sees it immediately.
    await generateSubscriptionOrders();
    nav.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Customer</Text>
        {customer ? (
          <Card style={styles.selected}>
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

        <Text style={styles.section}>Delivery days</Text>
        <View style={styles.chipRow}>
          {presets.map((p) => (
            <Pressable key={p.label} onPress={() => setDays(p.days)} style={styles.presetChip}>
              <Text style={styles.presetText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.dayRow}>
          {WEEKDAY_SHORT.map((label, i) => {
            const day = i as Weekday;
            const isClosed = closed.includes(day);
            const on = days.includes(day) && !isClosed;
            return (
              <Pressable
                key={label}
                onPress={() => toggleDay(day)}
                disabled={isClosed}
                style={[styles.dayChip, on && styles.dayChipOn, isClosed && styles.dayChipClosed]}
              >
                <Text style={[styles.dayText, on && styles.dayTextOn, isClosed && styles.dayTextClosed]}>
                  {label[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {closed.length > 0 && (
          <Text style={styles.closedHint}>
            Kitchen closed {describeClosedDays(closed)} — those days can't be chosen and are never
            billed.
          </Text>
        )}

        <Text style={styles.section}>Which round</Text>
        <View style={styles.chipRow}>
          {rounds.map((r) => {
            const on = roundIds.includes(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() =>
                  setRoundIds((current) =>
                    current.includes(r.id) ? current.filter((x) => x !== r.id) : [...current, r.id]
                  )
                }
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {roundIds.length > 1 && (
          <Text style={styles.roundHint}>
            They get a delivery in each round chosen, so {roundIds.length} deliveries per day.
          </Text>
        )}

        <Text style={styles.section}>What they get each delivery</Text>
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
            placeholder="e.g. Extra salad"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 2 }]}
          />
          <TextInput
            value={customPrice}
            onChangeText={setCustomPrice}
            placeholder="₹"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable onPress={addCustom} style={styles.addBtn}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <Text style={styles.section}>Pack type</Text>
        <View style={styles.chipRow}>
          {(['daily', 'weekly', 'monthly'] as BillingCycle[]).map((c) => (
            <Pressable key={c} onPress={() => setCycle(c)} style={[styles.chip, cycle === c && styles.chipOn]}>
              <Text style={[styles.chipText, cycle === c && styles.chipTextOn]}>
                {c === 'daily' ? 'Pay per day' : c === 'weekly' ? 'Weekly pack' : 'Monthly pack'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.cycleHint}>
          {cycle === 'daily'
            ? 'Charged for each delivery as it happens.'
            : `You raise a ${cycle} bill for the amount you agreed. ${
                deliveriesPerCycle > 0
                  ? `About ${deliveriesPerCycle} deliveries per ${cycle === 'weekly' ? 'week' : 'month'}.`
                  : ''
              }`}
        </Text>

        {cycle !== 'daily' && (
          <>
            <Text style={styles.section}>
              Agreed pack price ({CURRENCY} per {cycle === 'weekly' ? 'week' : 'month'})
            </Text>
            <TextInput
              value={packAmount}
              onChangeText={setPackAmount}
              placeholder={`e.g. ${cycle === 'weekly' ? '700' : '2500'}`}
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={styles.input}
            />
            <Text style={styles.cycleHint}>
              {packAmount.trim() && !isNaN(Number(packAmount)) && deliveriesPerCycle > 0
                ? `Works out at about ${formatMoney(
                    Math.round(Number(packAmount) / deliveriesPerCycle)
                  )} per delivery across ${deliveriesPerCycle} deliveries. Menu prices would give ${formatMoney(
                    perDay * deliveriesPerCycle
                  )}.`
                : `Optional, but recording it here means the figure is offered again when you raise their ${cycle} bill.`}
            </Text>
          </>
        )}

        <Text style={styles.section}>How the money arrives</Text>
        <Text style={styles.cycleHint}>
          However they settle up — cash, UPI or bank transfer. This applies whichever pack type they
          are on.
        </Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((p) => (
            <Pressable key={p} onPress={() => setPayment(p)} style={[styles.chip, payment === p && styles.chipOn]}>
              <Text style={[styles.chipText, payment === p && styles.chipTextOn]}>{PAYMENT_METHOD_LABELS[p]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Usual rider (optional)</Text>
        <View style={styles.chipRow}>
          <Pressable onPress={() => setRiderId(undefined)} style={[styles.chip, !riderId && styles.chipOn]}>
            <Text style={[styles.chipText, !riderId && styles.chipTextOn]}>Assign later</Text>
          </Pressable>
          {riders.map((r) => (
            <Pressable key={r.id} onPress={() => setRiderId(r.id)} style={[styles.chip, riderId === r.id && styles.chipOn]}>
              <Text style={[styles.chipText, riderId === r.id && styles.chipTextOn]}>{r.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Standing notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. no onions, leave at reception"
          placeholderTextColor={colors.muted}
          style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
          multiline
        />

                {!existing && (
          <Text style={styles.startHint}>Starts from {dateLabel(todayStr()).toLowerCase()}.</Text>
        )}

              </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Per delivery</Text>
          <Text style={styles.footerTotal}>{formatMoney(perDay)}</Text>
        </View>
        <Button
          title={existing ? 'Save changes' : 'Create pack'}
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
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  presetText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  roundHint: { fontSize: 12, color: colors.muted, marginTop: 6, fontStyle: 'italic' },
  dayRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipClosed: { backgroundColor: colors.border, borderColor: colors.border },
  dayText: { fontWeight: '800', color: colors.text, fontSize: 15 },
  dayTextOn: { color: '#fff' },
  dayTextClosed: { color: colors.muted, textDecorationLine: 'line-through' },
  closedHint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, fontStyle: 'italic' },
  cycleHint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
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
  startHint: { color: colors.muted, fontSize: 13, marginTop: spacing.xl, fontStyle: 'italic' },
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
