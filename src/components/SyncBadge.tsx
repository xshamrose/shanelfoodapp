import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sync } from '../data/sync';
import { useSyncStatus } from '../data/useSync';
import { colors, radius, spacing } from '../theme';

/**
 * Tells the team whether what they are looking at is shared with everyone else.
 * Tapping it retries anything stuck.
 */
export default function SyncBadge() {
  const { state, pending, error, cloudEnabled } = useSyncStatus();

  const look = !cloudEnabled
    ? { icon: 'phone-portrait-outline' as const, text: 'This phone only', bg: colors.border, fg: colors.muted }
    : state === 'synced'
    ? { icon: 'cloud-done-outline' as const, text: 'Shared with team', bg: colors.successSoft, fg: colors.success }
    : state === 'syncing'
    ? { icon: 'sync-outline' as const, text: 'Syncing…', bg: colors.infoSoft, fg: colors.info }
    : state === 'pending'
    ? {
        icon: 'cloud-offline-outline' as const,
        text: `${pending} change${pending === 1 ? '' : 's'} waiting`,
        bg: colors.warningSoft,
        fg: colors.warning,
      }
    : { icon: 'alert-circle-outline' as const, text: 'Cloud problem — tap to retry', bg: colors.dangerSoft, fg: colors.danger };

  const canRetry = cloudEnabled && (state === 'pending' || state === 'error');

  return (
    <View>
      <Pressable
        onPress={canRetry ? () => sync.flush() : undefined}
        style={({ pressed }) => [styles.badge, { backgroundColor: look.bg }, pressed && canRetry && { opacity: 0.8 }]}
      >
        <Ionicons name={look.icon} size={14} color={look.fg} />
        <Text style={[styles.text, { color: look.fg }]}>{look.text}</Text>
      </Pressable>
      {state === 'error' && error ? (
        <Text style={styles.error} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.xl,
  },
  text: { fontSize: 12, fontWeight: '700' },
  error: { fontSize: 11, color: colors.danger, marginTop: 4, maxWidth: 280 },
});
