import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../src/lib/auth";
import { SITE_URL } from "../../src/lib/api";
import { requestReview, statusLabel } from "../../src/lib/projects";
import { colors, radius, spacing, type } from "../../src/lib/theme";

/**
 * One project: the success screen right after publishing (fresh=1) and the
 * screen behind each row of the list. "View page" and "Ask the client for
 * a review" only make sense once it's live.
 */
export default function ProjectScreen() {
  const params = useLocalSearchParams<{ id: string; slug?: string; title?: string; status?: string; fresh?: string }>();
  const { hasAccess, refreshAccess } = useAuth();
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const fresh = params.fresh === "1";
  const live = params.status === "published";
  const s = statusLabel(params.status ?? "");

  async function send() {
    setMsg(null);
    if (clientName.trim().length < 2) return setMsg({ tone: "error", text: "Add your client's name." });
    if (!/^\S+@\S+\.\S+$/.test(clientEmail.trim())) return setMsg({ tone: "error", text: "Enter a valid email." });
    setSending(true);
    try {
      await requestReview(params.id, clientName.trim(), clientEmail.trim());
      setMsg({ tone: "ok", text: `Sent to ${clientEmail.trim()}. They'll get a one-time link by email.` });
      setClientName("");
      setClientEmail("");
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't send it. Try again." });
    } finally {
      setSending(false);
    }
  }

  function backToList() {
    if (router.canGoBack()) router.back();
    else router.replace("/projects");
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: fresh ? "Done" : "Project" }} />

      {fresh ? (
        <View style={[styles.banner, live ? styles.bannerLive : styles.bannerWait]}>
          <Text style={styles.bannerTitle}>{live ? "It's live on your profile." : "Sent for review."}</Text>
          <Text style={styles.body}>
            {live
              ? "Property managers can find it now. Ask your client for a review while the job is fresh."
              : "We check it before it goes live, usually within a day."}
          </Text>
        </View>
      ) : null}

      {params.title ? <Text style={styles.h1}>{params.title}</Text> : null}
      <View style={[styles.pill, live ? styles.pillLive : styles.pillWait]}>
        <Text style={[styles.pillText, live ? styles.pillTextLive : styles.pillTextWait]}>{s.text}</Text>
      </View>

      {live && params.slug ? (
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => WebBrowser.openBrowserAsync(`${SITE_URL}/case-studies/${encodeURIComponent(params.slug!)}`)}
        >
          <Text style={styles.secondaryBtnText}>View page</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.h2}>Ask the client for a review</Text>
        {!live ? (
          <Text style={styles.body}>Once it's live you can send your client a one-time link to review this job.</Text>
        ) : !hasAccess ? (
          <>
            <Text style={styles.body}>Client reviews are part of Trade Pro. They show on your profile and on this project.</Text>
            <Pressable
              onPress={async () => {
                await WebBrowser.openBrowserAsync(`${SITE_URL}/pricing`);
                await refreshAccess();
              }}
            >
              <Text style={styles.link}>See Trade Pro</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.body}>They get one email with a link that works once. Every review is checked before it shows.</Text>
            <TextInput
              style={styles.input}
              placeholder="Client name"
              placeholderTextColor={colors.ink3}
              value={clientName}
              onChangeText={setClientName}
              maxLength={100}
              autoComplete="off"
              textContentType="name"
            />
            <TextInput
              style={styles.input}
              placeholder="client@company.com"
              placeholderTextColor={colors.ink3}
              value={clientEmail}
              onChangeText={setClientEmail}
              maxLength={200}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            {msg ? <Text style={msg.tone === "ok" ? styles.ok : styles.error}>{msg.text}</Text> : null}
            <Pressable style={[styles.primaryBtn, sending && styles.btnDisabled]} disabled={sending} onPress={send}>
              <Text style={styles.primaryBtnText}>{sending ? "Sending…" : "Send review request"}</Text>
            </Pressable>
          </>
        )}
      </View>

      {fresh ? (
        <Pressable style={styles.secondaryBtn} onPress={backToList}>
          <Text style={styles.secondaryBtnText}>Back to projects</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: colors.bg, flexGrow: 1 },
  banner: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  bannerLive: { backgroundColor: colors.teal100, borderColor: colors.teal300 },
  bannerWait: { backgroundColor: colors.periwinkleSoft, borderColor: colors.border },
  bannerTitle: { ...type.h2 },
  h1: { ...type.h1 },
  h2: { ...type.h2 },
  body: { ...type.body, marginTop: spacing.xs },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 2, marginTop: spacing.sm },
  pillLive: { backgroundColor: colors.teal100 },
  pillWait: { backgroundColor: colors.periwinkleSoft },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextLive: { color: colors.tealInk },
  pillTextWait: { color: colors.periwinkle },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    color: colors.ink,
    backgroundColor: colors.paper,
    fontSize: 16,
  },
  ok: { color: colors.tealInk, marginTop: spacing.md, fontSize: 14 },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  link: { color: colors.tealInk, fontWeight: "700", marginTop: spacing.md },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  secondaryBtn: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  secondaryBtnText: { color: colors.indigo, fontWeight: "700", fontSize: 15 },
});
