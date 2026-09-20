import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "./themed-text";

/** Skärmyta med säkra marginaler, scroll och "dra för att uppdatera". */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  withTabs = false,
  style,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  withTabs?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: Spacing.three,
    paddingBottom: insets.bottom + (withTabs ? BottomTabInset : 0) + Spacing.four,
    paddingHorizontal: Spacing.three,
  };
  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <View style={[styles.content, padding, style]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, padding, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Button({
  title,
  variant = "primary",
  loading = false,
  style,
  disabled,
  ...rest
}: PressableProps & { title: string; variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const bg = { primary: theme.primary, secondary: theme.backgroundElement, danger: theme.backgroundElement, ghost: "transparent" }[variant];
  const fg = { primary: theme.onPrimary, secondary: theme.text, danger: theme.danger, ghost: theme.primary }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: pressed || disabled ? 0.6 : 1 }, style]}
      {...rest}>
      {loading ? <ActivityIndicator color={fg} /> : <ThemedText style={{ color: fg, fontWeight: "600" }}>{title}</ThemedText>}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }, props.style]}
    />
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const inner = <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.text} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <ThemedText themeColor="textSecondary" style={{ textAlign: "center" }}>
        {message}
      </ThemedText>
      {onRetry ? <Button title="Försök igen" variant="secondary" onPress={onRetry} style={{ marginTop: Spacing.three }} /> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <ThemedText themeColor="textSecondary" style={{ textAlign: "center" }}>
        {text}
      </ThemedText>
    </View>
  );
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: "100%", maxWidth: MaxContentWidth, alignSelf: "center", gap: Spacing.three, flexGrow: 1 },
  button: { paddingVertical: 14, paddingHorizontal: Spacing.four, borderRadius: 12, alignItems: "center", justifyContent: "center", minHeight: 48 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 16, minHeight: 48 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four, gap: Spacing.two },
});
