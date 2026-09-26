import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { db, useCollection } from '../data/store';
import { colors, radius, spacing } from '../theme';
import { SETTINGS_ID, Weekday, WEEKDAY_SHORT } from '../types';
import { closedDaysOf, describeClosedDays } from '../utils/calendar';
import { generateSubscriptionOrders } from '../utils/subscriptions';

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ClosedDaysScreen() {
  useCollection(db.settings);
  const settings = db.settings.get(SETTINGS_ID);
  const closed = closedDaysOf(settings);

  const toggle = async (day: Weekday) => {
    const next = closed.includes(day) ? closed.filter((d) => d !== day) : [...closed, day];
    await db.settings.upsert({
      id: SETTINGS_ID,
      closedDays: next.sort((a, b) => a - b),
    });
    // Opening a day that was shut should fill in its deliveries straight away.
    await generateSubscriptionOrders();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <Text style={styles.intro}>
        Tap a day to switch the kitchen off or on. On a closed day nothing is cooked, no deliveries
        are created, and nothing is billed — even for customers whose plan includes that day.
      </Text>

      <Card>
        {ALL_DAYS.map((day) => {
          const isClosed = closed.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggle(day)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.pill, isClosed ? styles.pillClosed : styles.pillOpen]}>
                <Text style={[styles.pillText, isClosed && styles.pillTextClosed]}>
                  {WEEKDAY_SHORT[day]}
                </Text>
              </View>
              <Text style={[styles.dayName, isClosed && styles.dayNameClosed]}>{FULL_NAMES[day]}</Text>
              {isClosed ? (
                <View style={styles.statusRow}>
                  <Ionicons name="moon-outline" size={16} color={colors.danger} />
                  <Text style={styles.closedText}>Closed</Text>
                </View>
              ) : (
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.openText}>Open</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </Card>

      <View style={styles.summary}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
        <Text style={styles.summaryText}>
          {closed.length === 0
            ? 'The kitchen is open every day.'
            : `Closed on ${describeClosedDays(closed)}. Monthly and weekly packs skip these days automatically, so customers are never charged for them.`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pill: {
    width: 44,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillOpen: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  pillClosed: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  pillText: { fontWeight: '800', fontSize: 13, color: colors.success },
  pillTextClosed: { color: colors.danger },
  dayName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  dayNameClosed: { color: colors.muted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  closedText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  openText: { fontSize: 13, fontWeight: '700', color: colors.success },
  summary: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  summaryText: { flex: 1, fontSize: 12, color: colors.info, lineHeight: 17 },
});
