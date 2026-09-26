import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Fab } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { Expense } from '../types';
import { periodRange } from '../utils/accounts';
import { dateLabel } from '../utils/dates';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Ingredients: 'basket-outline',
  'Gas & fuel': 'flame-outline',
  Salaries: 'people-outline',
  Rent: 'home-outline',
  Packaging: 'cube-outline',
  Transport: 'bicycle-outline',
  Other: 'ellipsis-horizontal',
};

export default function ExpensesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const expenses = useCollection(db.expenses);
  const staff = useCollection(db.staff);
  const [monthOffset, setMonthOffset] = useState(0);

  const range = useMemo(() => {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const refStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`;
    return periodRange('month', refStr);
  }, [monthOffset]);

  const { sections, total } = useMemo(() => {
    const inMonth = expenses.filter((e) => e.date >= range.start && e.date <= range.end);
    const byDate = new Map<string, Expense[]>();
    for (const e of inMonth) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }
    return {
      sections: [...byDate.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, data]) => ({ title: date, data })),
      total: inMonth.reduce((sum, e) => sum + e.amount, 0),
    };
  }, [expenses, range]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setMonthOffset((m) => m - 1)} style={styles.arrow} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.primaryDark} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.monthText}>{range.label}</Text>
          <Text style={styles.monthTotal}>{formatMoney(total)}</Text>
        </View>
        <Pressable
          onPress={() => setMonthOffset((m) => Math.min(0, m + 1))}
          style={[styles.arrow, monthOffset >= 0 && { opacity: 0.3 }]}
          hitSlop={8}
          disabled={monthOffset >= 0}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primaryDark} />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{dateLabel(section.title)}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => nav.navigate('ExpenseEdit', { id: item.id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={CATEGORY_ICONS[item.category] ?? 'ellipsis-horizontal'}
                size={20}
                color={colors.primaryDark}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.category}>{item.category}</Text>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              {item.paidBy ? (
                <Text style={styles.paidBy}>
                  paid by {staff.find((s) => s.id === item.paidBy)?.name ?? 'unknown'}
                </Text>
              ) : null}
            </View>
            <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No expenses this month"
            subtitle="Record what you spend so the Accounts screen can show real profit."
          />
        }
      />
      <Fab onPress={() => nav.navigate('ExpenseEdit', {})} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  monthText: { fontSize: 15, fontWeight: '700', color: colors.text },
  monthTotal: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: { fontSize: 15, fontWeight: '700', color: colors.text },
  note: { fontSize: 13, color: colors.muted, marginTop: 2 },
  paidBy: { fontSize: 11, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  amount: { fontSize: 16, fontWeight: '800', color: colors.text },
});
