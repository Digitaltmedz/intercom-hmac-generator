import "@/global.css";

import { Platform } from "react-native";

/** Byt färgerna här när kundens grafiska profil är satt. */
export const Colors = {
  light: {
    text: "#111111",
    textSecondary: "#5F6368",
    background: "#FFFFFF",
    backgroundElement: "#F2F3F5",
    backgroundSelected: "#E3E5E8",
    primary: "#1F6F5F",
    onPrimary: "#FFFFFF",
    danger: "#B3261E",
    border: "#E1E3E6",
  },
  dark: {
    text: "#FFFFFF",
    textSecondary: "#B0B4BA",
    background: "#000000",
    backgroundElement: "#1C1D20",
    backgroundSelected: "#2E3135",
    primary: "#4FB39B",
    onPrimary: "#08211B",
    danger: "#F2B8B5",
    border: "#2A2C30",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: "system-ui", serif: "ui-serif", rounded: "ui-rounded", mono: "ui-monospace" },
  default: { sans: "normal", serif: "serif", rounded: "normal", mono: "monospace" },
  web: { sans: "var(--font-display)", serif: "var(--font-serif)", rounded: "var(--font-rounded)", mono: "var(--font-mono)" },
});

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
