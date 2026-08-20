import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../src/lib/auth";
import { colors, radius, spacing, type } from "../src/lib/theme";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else router.replace("/");
  }

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>PMRFP</Text>
      <Text style={styles.h1}>Sign in</Text>
      <Text style={styles.body}>Same login as pmrfp.com.</Text>

      <TextInput
        style={styles.input}
        placeholder="you@company.com"
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} disabled={busy} onPress={submit}>
        <Text style={styles.primaryBtnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>

      <Pressable onPress={() => WebBrowser.openBrowserAsync("https://pmrfp.com/sign-up")}>
        <Text style={styles.link}>No account yet? Join on the web</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: spacing.lg, backgroundColor: colors.bg },
  eyebrow: { ...type.eyebrow, marginTop: spacing.xl },
  h1: { ...type.display, marginTop: spacing.xs },
  body: { ...type.body, marginTop: spacing.xs, marginBottom: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    color: colors.ink,
    backgroundColor: colors.paper,
    fontSize: 15,
  },
  error: { color: colors.error, marginBottom: spacing.md, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  link: { color: colors.tealInk, fontWeight: "700", marginTop: spacing.lg, textAlign: "center" },
});
