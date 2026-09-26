import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Fab, Tag } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { Subscription, WEEKDAY_SHORT } from '../types';
import { orderTotal } from '../utils/orders';
import { upcomingDeliveryDates } from '../utils/subscriptions';
import { dateLabel } from '../utils/dates';

/** "Mon–Fri" when the days run consecutively, otherwise "Mon, Wed, Fri". */
export function describeDays(days: number[]): string {
  if (days.length === 0) return 'No days chosen';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) {
    return `${WEEKDAY_SHORT[sorted[0]]}–${WEEKDAY_SHORT[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export default function SubscriptionsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const subs = useCollection(db.subscriptions);
  const customers = useCollection(db.customers);
  useCollection(db.skips);
  useCollection(db.orders);

  const sorted = useMemo(() => {
    const name = (s: Subscription) => customers.find((c) => c.id === s.customerId)?.name ?? '';
    return [...subs].sort(
      (a, b) => Number(b.active) - Number(a.active) || name(a).localeCompare(name(b))
    );
  }, [subs, customers]);

  const renderItem = ({ item }: { item: Subscription }) => {
    const customer = customers.find((c) => c.id === item.customerId);
    const next = upcomingDeliveryDates(item, 14)[0];
    return (
      <Pressable
        onPress={() => nav.navigate('SubscriptionDetail', { id: item.id })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.name} numberOfLines={1}>
            {customer?.name ?? 'Unknown customer'}
          </Text>
          <Text style={styles.amount}>{formatMoney(orderTotal(item.lines))}/day</Text>
        </View>
        <Text style={styles.items} numberOfLines={2}>
          {item.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
        </Text>
        <View style={styles.tagRow}>
          <Tag text={describeDays(item.daysOfWeek)} tone="primary" />
          {item.active ? (
            next ? (
              <Tag text={`Next: ${dateLabel(next)}`} tone="info" />
            ) : (
              <Tag text="No upcoming days" tone="warning" />
            )
          ) : (
            <Tag text="Paused" tone="warning" />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={sorted}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        ListEmptyComponent={
          <EmptyState
            icon="repeat-outline"
            title="No packs yet"
            subtitle="Set one up and its deliveries appear in Orders automatically each day."
          />
        }
      />
      <Fab onPress={() => nav.navigate('SubscriptionEdit', {})} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  amount: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  items: { fontSize: 13, color: colors.muted, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
