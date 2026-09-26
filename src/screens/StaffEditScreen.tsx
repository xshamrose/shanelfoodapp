import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, confirmAsync, Field, notify } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, uid } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, radius, spacing } from '../theme';
import { Role, ROLE_LABELS } from '../types';

const ROLES: Role[] = ['dispatch', 'rider', 'accountant', 'owner'];

export default function StaffEditScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'StaffEdit'>>();
  const { user } = useAuth();
  const existing = route.params?.id ? db.staff.get(route.params.id) : undefined;
  const isSelf = existing?.id === user?.id;

  const [name, setName] = useState(existing?.name ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'rider');
  const [pin, setPin] = useState(existing?.pin ?? '');
  const [active, setActive] = useState(existing?.active ?? true);

  const save = async () => {
    if (!name.trim()) return notify('A name is required.', 'Missing info');
    if (!/^\d{4}$/.test(pin)) return notify('PIN must be exactly 4 digits.', 'Missing info');
    const duplicate = db.staff
      .getAll()
      .find((s) => s.id !== existing?.id && s.pin === pin && s.active);
    if (duplicate && active) {
      return notify(`${duplicate.name} already uses this PIN. Pick a different one.`, 'PIN in use');
    }
    if (isSelf && !active) return notify('You cannot deactivate yourself.', 'Not allowed');
    await db.staff.upsert({
      id: existing?.id ?? uid(),
      name: name.trim(),
      role,
      pin,
      active,
    });
    nav.goBack();
  };

  const remove = async () => {
    if (!existing) return;
    if (isSelf) return notify('You cannot delete yourself.', 'Not allowed');
    const ok = await confirmAsync('Remove staff member?', `${existing.name} will no longer be able to log in.`);
    if (ok) {
      await db.staff.remove(existing.id);
      nav.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}>
        <Field label="Name *" value={name} onChangeText={setName} placeholder="e.g. Ravi" autoFocus={!existing} />

        <Text style={styles.label}>Role *</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[styles.roleChip, role === r && styles.roleChipOn]}
            >
              <Text style={[styles.roleChipText, role === r && styles.roleChipTextOn]}>{ROLE_LABELS[r]}</Text>
            </Pressable>
          ))}
        </View>

        <Field
          label="Login PIN (4 digits) *"
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
          placeholder="e.g. 4821"
          keyboardType="number-pad"
          maxLength={4}
        />

        {existing && !isSelf ? (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Active (can log in)</Text>
            <Switch
              value={active}
              onValueChange={setActive}
              trackColor={{ true: colors.success, false: colors.border }}
              thumbColor="#fff"
            />
          </View>
        ) : null}

        <Button title={existing ? 'Save changes' : 'Add staff member'} icon="checkmark" onPress={save} />
        {existing && !isSelf ? (
          <View style={{ marginTop: spacing.md }}>
            <Button title="Remove staff member" variant="danger" icon="trash-outline" onPress={remove} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  roleChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  roleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { fontWeight: '600', color: colors.text },
  roleChipTextOn: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  switchLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
});
