import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, confirmAsync, Field, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, uid, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, radius, spacing } from '../theme';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../types';
import { addDaysStr, dateLabel, todayStr } from '../utils/dates';

export default function ExpenseEditScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExpenseEdit'>>();
  const { user } = useAuth();
  const staff = useCollection(db.staff).filter((s) => s.active);
  const existing = route.params?.id ? db.expenses.get(route.params.id) : undefined;

  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? 'Ingredients');
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState(existing?.date ?? todayStr());
  const [paidBy, setPaidBy] = useState<string | undefined>(existing?.paidBy ?? user?.id);

  const save = async () => {
    const value = Number(amount);
    if (!amount.trim() || isNaN(value) || value <= 0) {
      return notify('Enter how much was spent.');
    }
    await db.expenses.upsert({
      id: existing?.id ?? uid(),
      date,
      category,
      amount: value,
      note: note.trim() || undefined,
      paidBy,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    nav.goBack();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmAsync('Delete this expense?', 'It will no longer count against profit.');
    if (ok) {
      await db.expenses.remove(existing.id);
      nav.goBack();
    }
  };

  const dayOptions = [todayStr(), addDaysStr(todayStr(), -1), addDaysStr(todayStr(), -2)];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
        <Field
          label={`Amount spent (${CURRENCY}) *`}
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 850"
          keyboardType="numeric"
          autoFocus={!existing}
        />

        <Text style={styles.label}>Category *</Text>
        <View style={styles.chipRow}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.chip, category === c && styles.chipOn]}
            >
              <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Date</Text>
        <View style={styles.chipRow}>
          {dayOptions.map((d) => (
            <Pressable key={d} onPress={() => setDate(d)} style={[styles.chip, date === d && styles.chipOn]}>
              <Text style={[styles.chipText, date === d && styles.chipTextOn]}>{dateLabel(d)}</Text>
            </Pressable>
          ))}
          {!dayOptions.includes(date) && (
            <View style={[styles.chip, styles.chipOn]}>
              <Text style={styles.chipTextOn}>{dateLabel(date)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.label}>Paid by</Text>
        <View style={styles.chipRow}>
          {staff.map((s) => (
            <Pressable key={s.id} onPress={() => setPaidBy(s.id)} style={[styles.chip, paidBy === s.id && styles.chipOn]}>
              <Text style={[styles.chipText, paidBy === s.id && styles.chipTextOn]}>{s.name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. vegetables from the market"
            multiline
          />
        </View>

        <Button title={existing ? 'Save changes' : 'Add expense'} icon="checkmark" onPress={save} />
        {existing ? (
          <View style={{ marginTop: spacing.md }}>
            <Button title="Delete expense" variant="danger" icon="trash-outline" onPress={remove} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
