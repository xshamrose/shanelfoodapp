import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, confirmAsync, Field } from '../components/ui';
import { db, uid } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, CURRENCY, spacing } from '../theme';

export default function MenuItemEditScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'MenuItemEdit'>>();
  const existing = route.params?.id ? db.menu.get(route.params.id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [available, setAvailable] = useState(existing?.available ?? true);

  const save = async () => {
    const priceNum = Number(price);
    if (!name.trim() || !price.trim() || isNaN(priceNum) || priceNum < 0) {
      const msg = 'A name and a valid price are required.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Missing info', msg);
      return;
    }
    await db.menu.upsert({
      id: existing?.id ?? uid(),
      name: name.trim(),
      price: priceNum,
      category: category.trim() || undefined,
      available,
    });
    nav.goBack();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmAsync('Delete item?', `${existing.name} will be removed from the menu.`);
    if (ok) {
      await db.menu.remove(existing.id);
      nav.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}>
        <Field label="Dish name *" value={name} onChangeText={setName} placeholder="e.g. Veg Meal Box" autoFocus={!existing} />
        <Field
          label={`Price (${CURRENCY}) *`}
          value={price}
          onChangeText={setPrice}
          placeholder="e.g. 120"
          keyboardType="numeric"
        />
        <Field label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Meal Boxes, Add-ons" />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Available today</Text>
          <Switch
            value={available}
            onValueChange={setAvailable}
            trackColor={{ true: colors.success, false: colors.border }}
            thumbColor="#fff"
          />
        </View>

        <Button title={existing ? 'Save changes' : 'Add to menu'} icon="checkmark" onPress={save} />
        {existing ? (
          <View style={{ marginTop: spacing.md }}>
            <Button title="Delete item" variant="danger" icon="trash-outline" onPress={remove} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
