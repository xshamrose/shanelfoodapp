import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, SearchBar, Tag } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { BILLING_CYCLE_SHORT } from '../types';
import { allAccounts, CustomerAccount, totalOwed, totalUninvoiced } from '../utils/billing';

type Filter = 'attention' | 'all';

export default function DuesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const customers = useCollection(db.customers);
  const orders = useCollection(db.orders);
  const bills = useCollection(db.bills);
  const payments = useCollection(db.payments);
  const [filter, setFilter] = useState<Filter>('attention');
  const [query, setQuery] = useState('');

  const accounts = useMemo(
    () => allAccounts(customers, orders, bills, payments),
    [customers, orders, bills, payments]
  );

  const owed = totalOwed(accounts);
  const waiting = totalUninvoiced(accounts);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = accounts;
    if (filter === 'attention') {
      list = list.filter((a) => a.balance !== 0 || a.uninvoiced.count > 0);
    }
    if (q) list = list.filter((a) => a.customerName.toLowerCase().includes(q));
    return list;
  }, [accounts, filter, query]);

  const renderItem = ({ item }: { item: CustomerAccount }) => (
    <Pressable
      onPress={() => nav.navigate('CustomerStatement', { customerId: item.customerId })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.customerName}</Text>
        <View style={styles.tagRow}>
          <Tag text={BILLING_CYCLE_SHORT[item.cycle]} tone="muted" />
          {item.partlyPaid && <Tag text="Part paid" tone="warning" />}
          {item.uninvoiced.count > 0 && (
            <Tag text={`${item.uninvoiced.count} to bill`} tone="info" />
          )}
        </View>
        {item.lastPaymentDate && (
          <Text style={styles.meta}>Last paid {item.lastPaymentDate}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {item.balance > 0 ? (
          <>
            <Text style={styles.owes}>{formatMoney(item.balance)}</Text>
            <Text style={styles.owesLabel}>owes</Text>
          </>
        ) : item.balance < 0 ? (
          <>
            <Text style={styles.credit}>{formatMoney(Math.abs(item.balance))}</Text>
            <Text style={styles.creditLabel}>in credit</Text>
          </>
        ) : (
          <Text style={styles.settled}>Settled</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.summaryBar}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{formatMoney(owed)}</Text>
          <Text style={styles.summaryLabel}>owed to you</Text>
        </View>
        {waiting > 0 && (
          <View style={[styles.summaryCell, styles.summaryDivider]}>
            <Text style={[styles.summaryValue, { color: colors.info }]}>{formatMoney(waiting)}</Text>
            <Text style={styles.summaryLabel}>waiting to be billed</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={styles.filterRow}>
          {(['attention', 'all'] as Filter[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipOn]}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
                {f === 'attention' ? 'Needs attention' : 'All customers'}
              </Text>
            </Pressable>
          ))}
        </View>
        <SearchBar value={query} onChange={setQuery} placeholder="Search customer" />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(a) => a.customerId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: spacing.md }}
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            title={filter === 'attention' ? 'Nothing outstanding' : 'No customers'}
            subtitle={
              filter === 'attention'
                ? 'Everyone is settled and every delivery has been billed.'
                : 'Add customers in the Customers tab.'
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  summaryBar: { flexDirection: 'row', backgroundColor: colors.card, paddingVertical: spacing.lg },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.danger },
  summaryLabel: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontWeight: '700', fontSize: 13, color: colors.text },
  filterTextOn: { color: '#fff' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  owes: { fontSize: 18, fontWeight: '800', color: colors.danger },
  owesLabel: { fontSize: 11, color: colors.danger, fontWeight: '600' },
  credit: { fontSize: 18, fontWeight: '800', color: colors.success },
  creditLabel: { fontSize: 11, color: colors.success, fontWeight: '600' },
  settled: { fontSize: 13, fontWeight: '700', color: colors.success },
});
