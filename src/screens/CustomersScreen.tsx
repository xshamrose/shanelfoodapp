import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Fab, SearchBar } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, radius, spacing } from '../theme';
import { Customer } from '../types';
import { hasPreciseLocation, mapsUrlFor, Navigable } from '../utils/location';

/**
 * Open the customer's location in Google Maps.
 *
 * Takes the whole customer rather than just the address string, so a saved pin
 * is used when there is one — searching Maps for the text of a pasted link
 * finds nothing.
 */
export function openInMaps(target: Navigable) {
  const url = mapsUrlFor(target);
  if (url) Linking.openURL(url);
}

export function callPhone(phone: string) {
  Linking.openURL(`tel:${phone}`);
}

export default function CustomersScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const customers = useCollection(db.customers);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.address.toLowerCase().includes(q)
    );
  }, [customers, query]);

  const renderItem = ({ item }: { item: Customer }) => (
    <Pressable
      onPress={() => nav.navigate('CustomerEdit', { id: item.id })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{item.name}</Text>
          {hasPreciseLocation(item) && (
            <Ionicons name="location" size={14} color={colors.success} />
          )}
        </View>
        <Text style={styles.address} numberOfLines={2}>
          {item.address}
          {item.landmark ? ` · ${item.landmark}` : ''}
        </Text>
        {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
      </View>
      <View style={styles.actions}>
        {item.phone ? (
          <Pressable onPress={() => callPhone(item.phone)} style={styles.actionBtn} hitSlop={8}>
            <Ionicons name="call" size={20} color={colors.success} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => openInMaps(item)} style={styles.actionBtn} hitSlop={8}>
          <Ionicons name="navigate" size={20} color={colors.info} />
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Search name, phone or address" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={query ? 'No matches' : 'No customers yet'}
            subtitle={query ? 'Try a different search.' : 'Tap + to add your first customer.'}
          />
        }
      />
      <Fab onPress={() => nav.navigate('CustomerEdit', {})} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  address: { fontSize: 13, color: colors.muted, marginTop: 2 },
  phone: { fontSize: 13, color: colors.text, marginTop: 4, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
