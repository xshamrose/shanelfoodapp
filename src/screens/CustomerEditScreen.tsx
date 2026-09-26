import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, confirmAsync, Field } from '../components/ui';
import { db, uid } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, radius, spacing } from '../theme';
import { BILLING_CYCLE_LABELS, BILLING_CYCLE_SHORT, BillingCycle } from '../types';
import { extractLatLng, looksLikeUrl, mapsUrlFor } from '../utils/location';

export default function CustomerEditScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerEdit'>>();
  const existing = route.params?.id ? db.customers.get(route.params.id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [landmark, setLandmark] = useState(existing?.landmark ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [mapLink, setMapLink] = useState(existing?.mapLink ?? '');
  const [cycle, setCycle] = useState<BillingCycle>(existing?.billingCycle ?? 'daily');

  // Coordinates come free when the pasted link contains them; short links
  // (maps.app.goo.gl) do not, and are opened as-is instead.
  const coords = extractLatLng(mapLink);
  const linkIsUsable = looksLikeUrl(mapLink) || coords !== null;
  const linkEntered = mapLink.trim().length > 0;

  const save = async () => {
    if (!name.trim() || !address.trim()) {
      const msg = 'Name and address are required.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Missing info', msg);
      return;
    }
    if (linkEntered && !linkIsUsable) {
      const msg =
        'That does not look like a Google Maps link. Paste the whole link starting with https://, or leave it blank.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Check the link', msg);
      return;
    }
    await db.customers.upsert({
      id: existing?.id ?? uid(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      landmark: landmark.trim() || undefined,
      notes: notes.trim() || undefined,
      billingCycle: cycle,
      mapLink: linkEntered ? mapLink.trim() : undefined,
      lat: coords?.lat,
      lng: coords?.lng,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    nav.goBack();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmAsync('Delete customer?', `${existing.name} will be removed from the address book.`);
    if (ok) {
      await db.customers.remove(existing.id);
      nav.goBack();
    }
  };

  const testLink = () => {
    const url = mapsUrlFor({ mapLink, lat: coords?.lat, lng: coords?.lng });
    if (url) Linking.openURL(url);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}>
        <Field label="Customer name *" value={name} onChangeText={setName} placeholder="e.g. Priya Sharma" autoFocus={!existing} />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Mobile number" keyboardType="phone-pad" />
        <Field
          label="Delivery address *"
          value={address}
          onChangeText={setAddress}
          placeholder="Flat / building / street / area"
          multiline
        />
        <Field label="Landmark" value={landmark} onChangeText={setLandmark} placeholder="e.g. opposite the blue pharmacy" />

        <Text style={styles.label}>How they pay *</Text>
        <View style={styles.chipRow}>
          {(Object.keys(BILLING_CYCLE_LABELS) as BillingCycle[]).map((c) => (
            <Pressable key={c} onPress={() => setCycle(c)} style={[styles.chip, cycle === c && styles.chipOn]}>
              <Text style={[styles.chipText, cycle === c && styles.chipTextOn]}>
                {BILLING_CYCLE_SHORT[c]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info} />
          <Text style={styles.helpText}>
            {cycle === 'daily'
              ? 'Every delivery is charged to them as it happens.'
              : `Deliveries are not charged one by one. You raise a ${cycle} bill for the amount you agreed, and the app shows deliveries still waiting to be billed.`}
          </Text>
        </View>

        <Field
          label="Google Maps location (recommended)"
          value={mapLink}
          onChangeText={setMapLink}
          placeholder="Paste the link the customer sent"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info} />
          <Text style={styles.helpText}>
            Ask the customer to share their location on WhatsApp, then copy the Google Maps link and
            paste it here. The rider then gets the exact spot instead of guessing from the address.
          </Text>
        </View>

        {linkEntered && (
          <View style={[styles.statusBox, linkIsUsable ? styles.statusOk : styles.statusBad]}>
            <Ionicons
              name={linkIsUsable ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={linkIsUsable ? colors.success : colors.danger}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: linkIsUsable ? colors.success : colors.danger }]}>
                {coords
                  ? `Exact pin saved (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
                  : linkIsUsable
                  ? 'Link saved — it will open in Google Maps'
                  : 'That does not look like a link'}
              </Text>
              {linkIsUsable && (
                <Pressable onPress={testLink} hitSlop={6}>
                  <Text style={styles.testLink}>Test it now ↗</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Field label="Delivery notes" value={notes} onChangeText={setNotes} placeholder="e.g. ring the bell twice" multiline />
        </View>

        <Button title={existing ? 'Save changes' : 'Add customer'} icon="checkmark" onPress={save} />
        {existing ? (
          <View style={{ marginTop: spacing.md }}>
            <Button title="Delete customer" variant="danger" icon="trash-outline" onPress={remove} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  helpBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  helpText: { flex: 1, fontSize: 12, color: colors.info, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statusBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  statusOk: { backgroundColor: colors.successSoft },
  statusBad: { backgroundColor: colors.dangerSoft },
  statusText: { fontSize: 13, fontWeight: '700' },
  testLink: { color: colors.primaryDark, fontWeight: '700', fontSize: 12, marginTop: 2 },
});
