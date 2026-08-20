import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * The SAME Supabase project the web app uses — same Auth, same Postgres, same
 * RLS. That is deliberate: `has_active_trade_access()` gates full RFP rows in
 * the database, so an unsubscribed trade sees teaser columns on ANY client.
 * The paywall cannot be bypassed by talking to the API from a phone.
 *
 * Never put the service-role key in this app. Anon key only.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy mobile/.env.example to mobile/.env and fill them in.",
  );
}

/**
 * Auth tokens go in the device keychain rather than AsyncStorage.
 * SecureStore has a 2048-byte per-value limit and is unavailable on web, so
 * fall back to localStorage when running `expo start --web`.
 */
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse in a native app — this would throw on RN.
    detectSessionInUrl: false,
  },
});
