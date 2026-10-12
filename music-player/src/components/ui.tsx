import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useSettings } from '../store/settings';

export type IconName = keyof typeof Ionicons.glyphMap;

export function haptic() {
  if (useSettings.getState().haptics) Haptics.selectionAsync().catch(() => {});
}

export function IconButton({
  name,
  onPress,
  size = 24,
  color,
  style,
  disabled,
  label,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  label?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? name}
      hitSlop={10}
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [styles.iconBtn, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={name} size={size} color={color ?? t.text} />
    </Pressable>
  );
}

export function Txt({
  children,
  style,
  dim,
  muted,
  bold,
  size = 15,
  lines,
  color,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  dim?: boolean;
  muted?: boolean;
  bold?: boolean;
  size?: number;
  lines?: number;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={lines}
      style={[
        { color: color ?? (muted ? t.textMuted : dim ? t.textDim : t.text), fontSize: size, fontWeight: bold ? '700' : '400' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({ children, style, padTop = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: t.bg, paddingTop: padTop ? insets.top : 0 }, style]}>{children}</View>;
}

export function Header({ title, right, back }: { title?: string; right?: ReactNode; back?: boolean }) {
  return (
    <View style={styles.header}>
      {back ? <IconButton name="chevron-back" size={28} onPress={() => router.back()} label="Zurück" /> : null}
      <Txt size={back ? 18 : 26} bold style={{ flex: 1, marginLeft: back ? 4 : 0 }} lines={1}>
        {title}
      </Txt>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt size={21} bold style={{ flex: 1 }}>
        {title}
      </Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Txt dim size={13} bold>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={[styles.chip, { backgroundColor: active ? t.accent : t.surfaceAlt }]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? t.onAccent : t.text} style={{ marginRight: 4 }} /> : null}
      <Text style={{ color: active ? t.onAccent : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  variant = 'accent',
  style,
  loading,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'accent' | 'outline' | 'subtle';
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
}) {
  const t = useTheme();
  const bg = variant === 'accent' ? t.accent : variant === 'subtle' ? t.surfaceAlt : 'transparent';
  const fg = variant === 'accent' ? t.onAccent : t.text;
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress?.();
      }}
      disabled={loading}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: bg, borderColor: variant === 'outline' ? t.textMuted : 'transparent', opacity: pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function PlayFab({ playing, onPress, size = 54 }: { playing: boolean; onPress: () => void; size?: number }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityLabel={playing ? 'Pause' : 'Abspielen'}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <Ionicons name={playing ? 'pause' : 'play'} size={size * 0.48} color={t.onAccent} style={{ marginLeft: playing ? 0 : 3 }} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={52} color={t.textMuted} />
      <Txt bold size={18} style={{ marginTop: 14, textAlign: 'center' }}>
        {title}
      </Txt>
      {text ? (
        <Txt dim style={{ marginTop: 6, textAlign: 'center', lineHeight: 21 }}>
          {text}
        </Txt>
      ) : null}
      {children ? <View style={{ marginTop: 18 }}>{children}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={t.accent} size="large" />
      {label ? (
        <Txt dim style={{ marginTop: 12 }}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function ListItem({
  icon,
  title,
  subtitle,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listItem, { backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}
    >
      {icon ? <Ionicons name={icon} size={22} color={danger ? t.danger : t.textDim} style={{ width: 30 }} /> : null}
      <View style={{ flex: 1 }}>
        <Txt color={danger ? t.danger : undefined} size={16}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt dim size={13} style={{ marginTop: 2 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 26, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 26,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, flexGrow: 1 },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
});
