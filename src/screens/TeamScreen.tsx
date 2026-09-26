import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fab, Tag } from '../components/ui';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, radius, spacing } from '../theme';
import { ROLE_LABELS } from '../types';

export default function TeamScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const staff = useCollection(db.staff);

  return (
    <View style={styles.root}>
      <FlatList
        data={staff}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => nav.navigate('StaffEdit', { id: item.id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, !item.active && { color: colors.muted }]}>{item.name}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                <Tag text={ROLE_LABELS[item.role]} tone="info" />
                {!item.active && <Tag text="Inactive" tone="danger" />}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        )}
      />
      <Fab onPress={() => nav.navigate('StaffEdit', {})} icon="person-add" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
});
