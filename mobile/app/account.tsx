import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../src/lib/auth";
import { registerForPush, savePushToken } from "../src/lib/push";
import { colors, radius, spacing, type } from "../src/lib/theme";

const SITE = "https://pmrfp.com";

export default function AccountScreen() {
  const { session, hasAccess, signOut, refreshAccess } = useAuth();
  const router = useRouter();
  const [pushOn, setPushOn] = useState(false);
  const [working, setWorking] = useState(false);

  if (!session) {
    return (
      <View style={styles.page}>
        <Text style={type.h2}>You're signed out.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.push("/sign-in")}>
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  async function togglePush(next: boolean) {
    if (!next) {
      // Turning off here is local only — the switch reflects intent, and the
      // real opt-out lives in OS settings. Don't pretend we revoked anything.
      setPushOn(false);
      return;
    }
    setWorking(true);
    const { token, error } = await registerForPush();
    if (error || !token) {
      setWorking(false);
      Alert.alert("Notifications unavailable", error ?? "Could not register this device.");
      return;
    }
    const { error: saveErr } = await savePushToken(token);
    setWorking(false);
    if (saveErr) Alert.alert("Couldn't save", saveErr);
    else setPushOn(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>Signed in as</Text>
      <Text style={styles.h1}>{session.user.email}</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Membership</Text>
        <Text style={styles.body}>
          {hasAccess
            ? "Trade Pro is active — full scope and contacts are unlocked."
            : "No active membership. You can browse the board, but full scope and contacts stay locked."}
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={async () => {
            // Subscriptions are handled on the web deliberately: this is a B2B
            // subscription rather than in-app content, so it sits outside the
            // IAP requirement and keeps the full $249.
            await WebBrowser.openBrowserAsync(hasAccess ? `${SITE}/dashboard/billing` : `${SITE}/pricing`);
            // They may have just subscribed in the browser.
            await refreshAccess();
          }}
        >
          <Text style={styles.primaryBtnText}>
            {hasAccess ? "Manage billing" : "See membership"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.h2}>New matching RFPs</Text>
            <Text style={styles.body}>
              Get a push the moment something in your trade and region is posted.
            </Text>
          </View>
          <Switch
            value={pushOn}
            disabled={working}
            onValueChange={togglePush}
            trackColor={{ true: colors.teal, false: colors.borderStrong }}
            thumbColor={colors.paper}
          />
        </View>
      </View>

      <Pressable
        style={styles.secondaryBtn}
        onPress={async () => {
          await signOut();
          router.replace("/");
        }}
      >
        <Text style={styles.secondaryBtnText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.bg, flexGrow: 1 },
  eyebrow: { ...type.eyebrow, marginTop: spacing.md },
  h1: { ...type.h1, marginTop: spacing.xs, marginBottom: spacing.lg },
  h2: { ...type.h2 },
  body: { ...type.body, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1 },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.indigo, fontWeight: "700", fontSize: 15 },
});
