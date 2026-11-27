import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/+$/, "");
const key = "pmrfp-native-session-v1";
const tokenShape = /^[a-f0-9]{64}$/;

export async function storedToken() {
  if (Platform.OS === "web") return null;
  const token=await SecureStore.getItemAsync(key);
  return token && tokenShape.test(token) ? token : null;
}

export async function saveToken(token: string | null) {
  if (Platform.OS === "web") return;
  if (token && tokenShape.test(token)) await SecureStore.setItemAsync(key,token);
  else await SecureStore.deleteItemAsync(key);
}
