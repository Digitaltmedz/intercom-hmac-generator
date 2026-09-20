import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AuthProvider, useAuth } from "@/lib/auth";

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { me } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (me === undefined) return;
    SplashScreen.hideAsync();
    const inAuth = segments[0] === "(auth)";
    if (!me && !inAuth) router.replace("/(auth)/login");
    else if (me && inAuth) router.replace("/(app)");
  }, [me, segments, router]);

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      <Stack.Screen name="course/[id]" options={{ title: "" }} />
      <Stack.Screen name="lesson/[id]" options={{ title: "" }} />
      <Stack.Screen name="forum/category/[id]" options={{ title: "" }} />
      <Stack.Screen name="forum/thread/[id]" options={{ title: "" }} />
      <Stack.Screen name="forum/new" options={{ title: "Ny tråd", presentation: "modal" }} />
      <Stack.Screen name="terms" options={{ title: "Regler och villkor", presentation: "modal" }} />
      <Stack.Screen name="no-access" options={{ title: "Ingen åtkomst" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}
