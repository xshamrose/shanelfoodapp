import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SyncBadge from '../components/SyncBadge';
import { Button, Card, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { db, useCollection } from '../data/store';
import { RootStackParamList } from '../navigation/params';
import { colors, formatMoney, radius, spacing } from '../theme';
import { ROLE_LABELS, SETTINGS_ID } from '../types';
import { closedDaysOf, describeClosedDays } from '../utils/calendar';
import { todayStr } from '../utils/dates';

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const orders = useCollection(db.orders);
  const subs = useCollection(db.subscriptions);
  useCollection(db.customers);
  useCollection(db.menu);
  useCollection(db.settings);
  const settings = db.settings.get(SETTINGS_ID);

  const today = todayStr();
  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => o.date === today && o.status !== 'cancelled');
    const delivered = todayOrders.filter((o) => o.status === 'delivered');
    const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const mine = user?.role === 'rider' ? todayOrders.filter((o) => o.riderId === user.id) : [];
    return {
      count: todayOrders.length,
      delivered: delivered.length,
      revenue,
      unassigned: todayOrders.filter((o) => !o.riderId && o.status !== 'delivered').length,
      myTotal: mine.length,
      myLeft: mine.filter((o) => o.status !== 'delivered').length,
    };
  }, [orders, today, user]);

  if (!user) return null;

  const isRider = user.role === 'rider';
  const activeSubs = subs.filter((s) => s.active).length;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}>
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hi, {user.name} 👋</Text>
          <View style={styles.badgeRow}>
            <Tag text={ROLE_LABELS[user.role]} tone="info" />
            <SyncBadge />
          </View>
        </View>
      </View>

      {isRider ? (
        <View style={styles.statsRow}>
          <Card style={styles.stat}>
            <Text style={styles.statNumber}>{stats.myLeft}</Text>
            <Text style={styles.statLabel}>To deliver</Text>
          </Card>
          <Card style={styles.stat}>
            <Text style={styles.statNumber}>{stats.myTotal - stats.myLeft}</Text>
            <Text style={styles.statLabel}>Delivered today</Text>
          </Card>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <Card style={styles.stat}>
              <Text style={styles.statNumber}>{stats.count}</Text>
              <Text style={styles.statLabel}>Orders today</Text>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statNumber}>{stats.delivered}</Text>
              <Text style={styles.statLabel}>Delivered</Text>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statNumber}>{formatMoney(stats.revenue)}</Text>
              <Text style={styles.statLabel}>Today's sales</Text>
            </Card>
          </View>

          {stats.unassigned > 0 && (
            <Pressable onPress={() => nav.navigate('Tabs')} style={styles.alert}>
              <Ionicons name="alert-circle" size={20} color={colors.warning} />
              <Text style={styles.alertText}>
                {stats.unassigned} order{stats.unassigned === 1 ? '' : 's'} today with no rider assigned
              </Text>
            </Pressable>
          )}
        </>
      )}

      {!isRider && (
        <>
          <Text style={styles.sectionTitle}>Manage</Text>
          <View style={{ gap: spacing.md }}>
            <Card style={styles.linkCard}>
              <Ionicons name="repeat-outline" size={24} color={colors.primaryDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Packs</Text>
                <Text style={styles.linkDesc}>
                  {activeSubs === 0
                    ? 'No repeat customers set up yet'
                    : `${activeSubs} running — deliveries created automatically`}
                </Text>
              </View>
            </Card>
            {user.role === 'owner' && (
              <>
                <Pressable onPress={() => nav.navigate('Menu')}>
                  {({ pressed }) => (
                    <Card style={[styles.linkCard, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="fast-food-outline" size={24} color={colors.primaryDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkTitle}>Menu &amp; prices</Text>
                        <Text style={styles.linkDesc}>Add dishes, change prices, mark sold out</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </Card>
                  )}
                </Pressable>
                <Pressable onPress={() => nav.navigate('ClosedDays')}>
                  {({ pressed }) => (
                    <Card style={[styles.linkCard, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="calendar-outline" size={24} color={colors.primaryDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkTitle}>Kitchen open days</Text>
                        <Text style={styles.linkDesc}>
                          Closed {describeClosedDays(closedDaysOf(settings))} — nothing cooked or billed
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </Card>
                  )}
                </Pressable>
                <Pressable onPress={() => nav.navigate('Rounds')}>
                  {({ pressed }) => (
                    <Card style={[styles.linkCard, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="time-outline" size={24} color={colors.primaryDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkTitle}>Delivery rounds</Text>
                        <Text style={styles.linkDesc}>Morning, evening — add or rename rounds</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </Card>
                  )}
                </Pressable>
                <Pressable onPress={() => nav.navigate('Team')}>
                  {({ pressed }) => (
                    <Card style={[styles.linkCard, pressed && { opacity: 0.85 }]}>
                      <Ionicons name="id-card-outline" size={24} color={colors.primaryDark} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkTitle}>Team &amp; logins</Text>
                        <Text style={styles.linkDesc}>Add staff, set roles and PINs</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                    </Card>
                  )}
                </Pressable>
              </>
            )}
            {user.role === 'dispatch' && (
              <Pressable onPress={() => nav.navigate('Expenses')}>
                {({ pressed }) => (
                  <Card style={[styles.linkCard, pressed && { opacity: 0.85 }]}>
                    <Ionicons name="receipt-outline" size={24} color={colors.primaryDark} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkTitle}>Record an expense</Text>
                      <Text style={styles.linkDesc}>Market runs, gas, packaging</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                  </Card>
                )}
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={{ marginTop: spacing.xxl }}>
        <Button title="Log out" variant="secondary" icon="log-out-outline" onPress={logout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  greetingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.sm },
  statNumber: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, textAlign: 'center' },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  alertText: { flex: 1, color: colors.warning, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  linkDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
