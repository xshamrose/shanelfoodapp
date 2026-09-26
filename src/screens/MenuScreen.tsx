import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { EmptyState, Fab } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { MenuItem } from '../types';

export default function MenuScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const menu = useCollection(db.menu);
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'dispatch';

  const sections = useMemo(() => {
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of menu) {
      const cat = item.category?.trim() || 'Other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    }
    return [...byCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({
        title,
        data: data.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [menu]);

  const toggle = (item: MenuItem, value: boolean) => {
    db.menu.upsert({ ...item, available: value });
  };

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          // The switch is a sibling of the tappable area, not inside it, so
          // flicking an item sold-out never also opens the edit form.
          <View style={styles.row}>
            <Pressable
              onPress={canEdit ? () => nav.navigate('MenuItemEdit', { id: item.id }) : undefined}
              style={({ pressed }) => [styles.rowText, pressed && canEdit && { opacity: 0.6 }]}
            >
              <Text style={[styles.name, !item.available && styles.offName]}>{item.name}</Text>
              <Text style={styles.price}>{formatMoney(item.price)}</Text>
            </Pressable>
            <Switch
              value={item.available}
              onValueChange={canEdit ? (v) => toggle(item, v) : undefined}
              disabled={!canEdit}
              trackColor={{ true: colors.success, false: colors.border }}
              thumbColor="#fff"
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState icon="fast-food-outline" title="No menu items" subtitle="Tap + to add your first dish." />
        }
      />
      {canEdit && <Fab onPress={() => nav.navigate('MenuItemEdit', {})} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sectionHeader: {
    fontSize: 13,
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  rowText: { flex: 1, paddingVertical: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  offName: { color: colors.muted, textDecorationLine: 'line-through' },
  price: { fontSize: 14, color: colors.primaryDark, fontWeight: '700', marginTop: 2 },
});
