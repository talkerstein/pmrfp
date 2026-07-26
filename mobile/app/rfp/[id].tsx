import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../src/lib/auth";
import { deadlineLabel, expressInterest, getRfp, type RfpFull, type RfpTeaser } from "../../src/lib/rfps";
import { colors, radius, spacing, type } from "../../src/lib/theme";

const SITE = "https://pmrfp.com";

export default function RfpDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [state, setState] = useState<{ rfp: RfpTeaser | RfpFull; locked: boolean } | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getRfp(id).then((r) => (r ? setState(r) : setMissing(true)));
  }, [id]);

  if (missing) {
    return (
      <View style={styles.centre}>
        <Text style={type.h2}>This opportunity is no longer open.</Text>
      </View>
    );
  }
  if (!state) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.indigo} />
      </View>
    );
  }

  const { rfp, locked } = state;
  const full = locked ? null : (rfp as RfpFull);

  async function submit() {
    if (!id) return;
    setSending(true);
    const { error } = await expressInterest(id, message.trim());
    setSending(false);
    if (error) Alert.alert("Couldn't submit", error);
    else setSent(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>{deadlineLabel(rfp.deadline)}</Text>
      <Text style={styles.h1}>{rfp.title}</Text>
      <Text style={styles.meta}>
        {[rfp.city, rfp.province].filter(Boolean).join(", ") || "Region not set"}
      </Text>

      {rfp.summary ? <Text style={styles.body}>{rfp.summary}</Text> : null}

      {locked ? (
        <View style={styles.lock}>
          <Text style={styles.lockTitle}>Full scope is for Trade Pro members</Text>
          <Text style={styles.body}>
            Membership unlocks the full scope, budget, and the contact for this and every other
            opportunity on the board — plus your listing in the directory.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() =>
              // Billing happens on the web, not through in-app purchase. This is a
              // B2B subscription, so it is outside Apple/Google's IAP requirement —
              // and it keeps the whole 249 rather than losing 30% of it.
              WebBrowser.openBrowserAsync(`${SITE}/pricing`)
            }
          >
            <Text style={styles.primaryBtnText}>See membership</Text>
          </Pressable>
          {!session ? (
            <Pressable onPress={() => router.push("/sign-in")}>
              <Text style={styles.link}>Already a member? Sign in</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {full?.scope ? (
            <Section title="Scope">
              <Text style={styles.body}>{full.scope}</Text>
            </Section>
          ) : null}
          {full?.requirements ? (
            <Section title="Requirements">
              <Text style={styles.body}>{full.requirements}</Text>
            </Section>
          ) : null}
          {full?.budget_public && (full.budget_min || full.budget_max) ? (
            <Section title="Budget">
              <Text style={styles.body}>
                {[full.budget_min, full.budget_max]
                  .filter((n): n is number => typeof n === "number")
                  .map((n) => `$${n.toLocaleString("en-CA")}`)
                  .join(" – ")}
              </Text>
            </Section>
          ) : null}
          {full?.submission_instructions ? (
            <Section title="How to submit">
              <Text style={styles.body}>{full.submission_instructions}</Text>
            </Section>
          ) : null}

          <Section title="Express interest">
            {sent ? (
              <View style={styles.sentBox}>
                <Text style={styles.sentText}>
                  Sent. The property manager can see your company now — we'll notify you if they
                  come back.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.body}>
                  A short note on why you're a fit goes further than a blank submission.
                </Text>
                <TextInput
                  style={styles.input}
                  multiline
                  numberOfLines={4}
                  placeholder="We've done six similar retrofits in the area this year…"
                  placeholderTextColor={colors.ink3}
                  value={message}
                  onChangeText={setMessage}
                />
                <Pressable
                  style={[styles.primaryBtn, sending && styles.btnDisabled]}
                  disabled={sending}
                  onPress={submit}
                >
                  <Text style={styles.primaryBtnText}>
                    {sending ? "Sending…" : "Express interest"}
                  </Text>
                </Pressable>
              </>
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  page: { padding: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { ...type.eyebrow },
  h1: { ...type.h1, marginTop: spacing.xs },
  h2: { ...type.h2, marginBottom: spacing.sm },
  meta: { ...type.small, marginTop: spacing.xs },
  body: { ...type.body, marginTop: spacing.sm },
  section: {
    marginTop: spacing.xl,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  lock: {
    marginTop: spacing.xl,
    backgroundColor: colors.teal100,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.teal300,
    padding: spacing.lg,
  },
  lockTitle: { ...type.h2, color: colors.tealInk },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  link: { color: colors.tealInk, fontWeight: "700", marginTop: spacing.md, textAlign: "center" },
  input: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: "top",
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  sentBox: {
    backgroundColor: colors.teal100,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  sentText: { ...type.body, color: colors.tealInk, marginTop: 0 },
});
