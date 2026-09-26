import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

/* ---------------------------------------------------------------- confirming
 *
 * The app draws its own confirmation dialog rather than using the browser's
 * window.confirm or the native Alert.
 *
 * window.confirm turned out to be unusable: after a few dialogs Chrome offers
 * "prevent this page from creating additional dialogs", and once that is ticked
 * every confirm silently answers "no". Stopping a pack, cancelling an order and
 * deleting a customer would all quietly do nothing, with no way for the user to
 * tell why. A dialog we render ourselves cannot be switched off, looks the same
 * on a phone and in a browser, and lets a destructive action look destructive.
 */

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
  /** A message with nothing to decide — one button, no Cancel. */
  infoOnly?: boolean;
  resolve: (ok: boolean) => void;
}

let present: ((req: ConfirmRequest) => void) | null = null;

export interface ConfirmOptions {
  /** Wording for the button that goes ahead, e.g. "Stop pack". */
  confirmLabel?: string;
  /** Shows the action in red, for anything that removes or cancels. */
  destructive?: boolean;
}

export function confirmAsync(
  title: string,
  message: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  const { confirmLabel = 'Yes', destructive = true } = options;
  if (!present) {
    // The host is always mounted in App; this only guards against a call during
    // the first frame. Saying no is the safe answer for a destructive action.
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    present!({ title, message, confirmLabel, destructive, resolve });
  });
}

/**
 * Tell the user something — a validation problem, or that an action worked.
 *
 * Same reasoning as confirmAsync: a blocked window.alert would make a button
 * look broken, because the reason it did nothing never appears.
 */
export function notify(message: string, title = 'Shanel Foods'): Promise<void> {
  if (!present) return Promise.resolve();
  return new Promise((resolve) => {
    present!({
      title,
      message,
      confirmLabel: 'OK',
      destructive: false,
      infoOnly: true,
      resolve: () => resolve(),
    });
  });
}

/** Mounted once at the root so any screen can ask for a confirmation. */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    present = setRequest;
    return () => {
      present = null;
    };
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <Modal
      visible={request !== null}
      transparent
      animationType="fade"
      onRequestClose={() => answer(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{request?.title}</Text>
          <Text style={styles.dialogMessage}>{request?.message}</Text>
          <View style={styles.dialogButtons}>
            {!request?.infoOnly && (
              <Pressable
                onPress={() => answer(false)}
                style={({ pressed }) => [styles.dialogBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.dialogCancel}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => answer(true)}
              style={({ pressed }) => [
                styles.dialogBtn,
                styles.dialogConfirm,
                request?.destructive && { backgroundColor: colors.danger },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.dialogConfirmText}>{request?.confirmLabel ?? 'Yes'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  style,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.dangerSoft : colors.primarySoft;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.primaryDark;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.multiline && { height: 80, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export type TagTone = 'info' | 'success' | 'danger' | 'muted' | 'warning' | 'primary';

export function Tag({ text, tone = 'info' }: { text: string; tone?: TagTone }) {
  const map = {
    info: { bg: colors.infoSoft, fg: colors.info },
    success: { bg: colors.successSoft, fg: colors.success },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    muted: { bg: colors.border, fg: colors.muted },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    primary: { bg: colors.primarySoft, fg: colors.primaryDark },
  } as const;
  const t = map[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

export function Fab({ onPress, icon = 'add' }: { onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={28} color="#fff" />
    </Pressable>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  dialogMessage: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: spacing.sm },
  dialogButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  dialogBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dialogCancel: { fontSize: 16, fontWeight: '700', color: colors.text },
  dialogConfirm: { backgroundColor: colors.primary, borderColor: colors.primary },
  dialogConfirmText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptySubtitle: { fontSize: 14, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 16, color: colors.text },
});
