import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * Push registration for the "a matching RFP was just posted" alert — the one
 * feature that genuinely needs to be native, since the point is reaching a
 * tradesperson who is on a job site and not looking at email.
 *
 * SDK 57 notes: the handler returns shouldShowBanner/shouldShowList (the old
 * shouldShowAlert is gone), and getExpoPushTokenAsync requires a projectId.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/**
 * Returns the Expo push token, or null with a reason we can show the user.
 * Simulators can't receive push, so we don't pretend otherwise.
 */
export async function registerForPush(): Promise<
  { token: string; error: null } | { token: null; error: string }
> {
  if (!Device.isDevice) {
    return { token: null, error: "Push notifications need a physical device." };
  }

  // Android 13+ shows its permission prompt off the back of a channel, so the
  // channel has to exist before we ask.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("rfp-alerts", {
      name: "New matching RFPs",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#91F2CF",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    return { token: null, error: "Notifications are turned off for PMRFP." };
  }

  const id = projectId();
  if (!id) {
    return {
      token: null,
      error: "No EAS projectId configured — run `eas init` before shipping a build.",
    };
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { token: data, error: null };
  } catch (e) {
    return { token: null, error: e instanceof Error ? e.message : "Could not get a push token." };
  }
}

/**
 * Persist the token so the rfp-alerts cron can reach this device.
 *
 * Requires the device_push_tokens table (see the migration alongside this
 * file). Deliberately non-fatal: failing to save a token should never block
 * someone from using the app.
 */
export async function savePushToken(token: string): Promise<{ error: string | null }> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { error: "Not signed in." };

  const { error } = await supabase.from("device_push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  return { error: error?.message ?? null };
}
