import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/src/api";

export async function registerPushToken(projectId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let finalStatus = status;
    if (status !== "granted") {
      const { status: asked } = await Notifications.requestPermissionsAsync();
      finalStatus = asked;
    }
    if (finalStatus !== "granted") return;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await api("/push/register", {
      method: "POST",
      body: { token: token.data, platform: Platform.OS },
    });
  } catch {
    /* ignore — push is best-effort */
  }
}

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  delaySeconds = 0,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: delaySeconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
        : null,
    });
  } catch {
    /* ignore */
  }
}
