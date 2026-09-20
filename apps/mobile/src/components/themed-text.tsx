import { StyleSheet, Text, type TextProps } from "react-native";

import { type ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ThemedTextProps = TextProps & {
  type?: "default" | "title" | "subtitle" | "heading" | "small" | "smallBold" | "label";
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = "default", themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? "text"] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  subtitle: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  small: { fontSize: 14, lineHeight: 20 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
});
