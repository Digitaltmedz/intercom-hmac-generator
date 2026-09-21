import { Tabs } from "expo-router/js-tabs";
import { Redirect } from "expo-router";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/lib/auth";

/** Webbversion av flikarna (NativeTabs finns bara på iOS/Android). */
export default function AppTabsWeb() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const { me } = useAuth();
  if (me && !me.entitled) return <Redirect href="/no-access" />;

  const icon = (label: string) => () => <ThemedText style={{ fontSize: 18 }}>{label}</ThemedText>;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: "Kurser", tabBarIcon: icon("▶") }} />
      <Tabs.Screen name="forum" options={{ title: "Forum", tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: icon("●") }} />
    </Tabs>
  );
}
