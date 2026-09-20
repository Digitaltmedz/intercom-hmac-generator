import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Redirect } from "expo-router";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";
import { useAuth } from "@/lib/auth";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const { me } = useAuth();

  // Utan aktiv prenumeration visas en förklaring, inga köpknappar (Apple 3.1.1).
  if (me && !me.entitled) return <Redirect href="/no-access" />;

  return (
    <NativeTabs backgroundColor={colors.background} indicatorColor={colors.backgroundElement} labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Kurser</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require("@/assets/images/tabIcons/home.png")} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="forum">
        <NativeTabs.Trigger.Label>Forum</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require("@/assets/images/tabIcons/explore.png")} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require("@/assets/images/tabIcons/home.png")} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
