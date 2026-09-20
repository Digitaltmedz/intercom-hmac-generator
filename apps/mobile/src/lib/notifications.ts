import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Ber om tillstånd och registrerar enhetens pushtoken hos backend.
 * Kräver ett riktigt bygge (fungerar inte i Expo Go på Android).
 */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice || Platform.OS === "web") return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Allmänt",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return; // Sätts när EAS-projektet skapats.
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
}
