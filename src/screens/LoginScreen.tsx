import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SyncBadge from '../components/SyncBadge';
import { Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, useCollection } from '../data/store';
import { colors, radius, spacing } from '../theme';
import { ROLE_LABELS, Staff } from '../types';

const ROLE_ICONS: Record<Staff['role'], keyof typeof Ionicons.glyphMap> = {
  owner: 'star',
  dispatch: 'restaurant',
  rider: 'bicycle',
  accountant: 'calculator',
};

export default function LoginScreen() {
  const staff = useCollection(db.staff).filter((s) => s.active);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    if (!selected || pin.length < 4) return;
    (async () => {
      const ok = await login(selected.id, pin);
      if (!ok) {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 600);
      }
    })();
  }, [pin, selected]);

  const press = (d: string) => {
    if (error) return;
    if (d === 'back') setPin((p) => p.slice(0, -1));
    else if (pin.length < 4) setPin((p) => p + d);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.logo}>🍱</Text>
        <Text style={styles.title}>Shanel Foods</Text>
        <Text style={styles.subtitle}>
          {selected ? `Hi ${selected.name}, enter your PIN` : 'Who is signing in?'}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <SyncBadge />
        </View>
      </View>

      {!selected ? (
        <View style={styles.staffList}>
          {staff.length === 0 && (
            <View style={styles.loadingTeam}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Fetching your team…</Text>
            </View>
          )}
          {staff.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSelected(s)}
              style={({ pressed }) => [styles.staffCard, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.avatar}>
                <Ionicons name={ROLE_ICONS[s.role]} size={22} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{s.name}</Text>
                <Tag text={ROLE_LABELS[s.role]} tone="muted" />
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.pinArea}>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  pin.length > i && { backgroundColor: error ? colors.danger : colors.primary },
                  error && { borderColor: colors.danger },
                ]}
              />
            ))}
          </View>
          {error && <Text style={styles.errorText}>Wrong PIN — try again</Text>}
          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k, i) =>
              k === '' ? (
                <View key={i} style={styles.key} />
              ) : (
                <Pressable
                  key={i}
                  onPress={() => press(k)}
                  style={({ pressed }) => [styles.key, styles.keyActive, pressed && { backgroundColor: colors.primarySoft }]}
                >
                  {k === 'back' ? (
                    <Ionicons name="backspace-outline" size={24} color={colors.text} />
                  ) : (
                    <Text style={styles.keyText}>{k}</Text>
                  )}
                </Pressable>
              )
            )}
          </View>
          <Pressable onPress={() => { setSelected(null); setPin(''); }}>
            <Text style={styles.switchUser}>← Choose a different person</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  logo: { fontSize: 48 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing.xs },
  staffList: { paddingHorizontal: spacing.xl, gap: spacing.md },
  loadingTeam: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  loadingText: { color: colors.muted, fontSize: 14 },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 },
  pinArea: { alignItems: 'center', flex: 1 },
  dots: { flexDirection: 'row', gap: spacing.lg, marginVertical: spacing.xl },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  errorText: { color: colors.danger, marginBottom: spacing.md, fontWeight: '600' },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 72 + 2 * spacing.lg,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  key: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  keyActive: {
    backgroundColor: colors.card,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyText: { fontSize: 26, fontWeight: '600', color: colors.text },
  switchUser: { color: colors.primaryDark, fontWeight: '600', marginTop: spacing.xl, padding: spacing.md },
});
