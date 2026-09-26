import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Card, confirmAsync, notify } from '../components/ui';
import { db, uid, useCollection } from '../data/store';
import { colors, radius, spacing } from '../theme';
import { MealRound } from '../types';
import { sortRounds } from '../utils/rounds';

export default function RoundsScreen() {
  const rounds = sortRounds(useCollection(db.rounds));
  const orders = useCollection(db.orders);
  const [newName, setNewName] = useState('');

  const add = async () => {
    const name = newName.trim();
    if (!name) return notify('Give the round a name, like Lunch.');
    if (rounds.some((r) => r.name.toLowerCase() === name.toLowerCase() && !r.deleted)) {
      return notify(`There is already a round called ${name}.`);
    }
    await db.rounds.upsert({
      id: uid(),
      name,
      sortOrder: (rounds[rounds.length - 1]?.sortOrder ?? 0) + 1,
      active: true,
    });
    setNewName('');
  };

  const move = async (round: MealRound, direction: -1 | 1) => {
    const index = rounds.findIndex((r) => r.id === round.id);
    const swapWith = rounds[index + direction];
    if (!swapWith) return;
    await db.rounds.upsert({ ...round, sortOrder: swapWith.sortOrder });
    await db.rounds.upsert({ ...swapWith, sortOrder: round.sortOrder });
  };

  const remove = async (round: MealRound) => {
    const used = orders.filter((o) => o.roundId === round.id).length;
    if (used > 0) {
      return notify(
        `${round.name} is used by ${used} order${used === 1 ? '' : 's'}. Turn it off instead — that stops new deliveries without touching your records.`
      );
    }
    const ok = await confirmAsync('Delete this round?', `${round.name} will be removed.`);
    if (ok) await db.rounds.remove(round.id);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
      <Text style={styles.intro}>
        Rounds are the delivery times in your day. Orders and plans are grouped by round, so the
        kitchen can see the morning batch separately from the evening one.
      </Text>

      {rounds.map((round, i) => (
        <Card key={round.id} style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            <View style={styles.moveCol}>
              <Pressable
                onPress={() => move(round, -1)}
                disabled={i === 0}
                style={[styles.moveBtn, i === 0 && { opacity: 0.25 }]}
                hitSlop={6}
              >
                <Ionicons name="chevron-up" size={18} color={colors.primaryDark} />
              </Pressable>
              <Pressable
                onPress={() => move(round, 1)}
                disabled={i === rounds.length - 1}
                style={[styles.moveBtn, i === rounds.length - 1 && { opacity: 0.25 }]}
                hitSlop={6}
              >
                <Ionicons name="chevron-down" size={18} color={colors.primaryDark} />
              </Pressable>
            </View>

            <TextInput
              value={round.name}
              onChangeText={(name) => db.rounds.upsert({ ...round, name })}
              style={styles.nameInput}
              placeholder="Round name"
              placeholderTextColor={colors.muted}
            />

            <Switch
              value={round.active}
              onValueChange={(active) => db.rounds.upsert({ ...round, active })}
              trackColor={{ true: colors.success, false: colors.border }}
              thumbColor="#fff"
            />
            <Pressable onPress={() => remove(round)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
          {!round.active && (
            <Text style={styles.offNote}>
              Off — no new deliveries are created for this round.
            </Text>
          )}
        </Card>
      ))}

      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.addLabel}>Add a round</Text>
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Lunch"
            placeholderTextColor={colors.muted}
            style={[styles.nameInput, styles.addInput]}
          />
          <Button title="Add" icon="add" onPress={add} style={{ paddingVertical: 12 }} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  moveCol: { gap: 2 },
  moveBtn: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderRadius: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addInput: { fontWeight: '600' },
  offNote: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginTop: spacing.sm },
  addLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
