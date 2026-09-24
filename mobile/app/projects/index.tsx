import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../src/lib/auth";
import { ApiError, SITE_URL } from "../../src/lib/api";
import { listProjects, statusLabel, type ProjectPlan, type ProjectRow } from "../../src/lib/projects";
import { colors, radius, spacing, type } from "../../src/lib/theme";

export default function ProjectsScreen() {
  const { session, refreshAccess } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const res = await listProjects();
      setProjects(res.projects);
      setPlan(res.plan);
    } catch (e) {
      // Signed in but refused: a property-manager account, not a listed company.
      if (e instanceof ApiError && e.status === 401) {
        setError("Projects are for trade and supplier companies listed on PMRFP.");
      } else {
        setError(e instanceof Error ? e.message : "Could not load your projects.");
      }
    }
  }, [session]);

  // Reload whenever the screen comes back into view (e.g. after publishing).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!session) {
    return (
      <View style={styles.page}>
        <Text style={styles.h1}>Your projects</Text>
        <Text style={styles.body}>Sign in with your company account to add jobs to your profile.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.push("/sign-in")}>
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (!projects && !error) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.indigo} />
      </View>
    );
  }

  const canAdd = !!plan?.ready && plan.canAddProject;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canAdd
            ? () => (
                <Pressable onPress={() => router.push("/projects/new")} hitSlop={12}>
                  <Text style={styles.headerBtn}>New</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.indigo} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Your profile</Text>
            <Text style={styles.h1}>Projects</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {plan && !plan.ready ? (
              <View style={styles.card}>
                <Text style={styles.h2}>Switching on soon</Text>
                <Text style={styles.body}>Photo projects aren't open yet. Check back shortly.</Text>
              </View>
            ) : null}
            {plan?.ready && !plan.canAddProject ? (
              <View style={[styles.card, styles.upsell]}>
                <Text style={styles.h2}>You've used your free project</Text>
                <Text style={styles.body}>
                  Trade Pro lets you add every job you're proud of, with up to 24 photos each, and ask clients for
                  reviews.
                </Text>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={async () => {
                    await WebBrowser.openBrowserAsync(`${SITE_URL}/pricing`);
                    await refreshAccess();
                    await load();
                  }}
                >
                  <Text style={styles.primaryBtnText}>See Trade Pro</Text>
                </Pressable>
              </View>
            ) : null}
            {canAdd && (projects?.length ?? 0) > 0 ? (
              <Pressable style={styles.primaryBtn} onPress={() => router.push("/projects/new")}>
                <Text style={styles.primaryBtnText}>Snap a new job</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          error ? null : (
            <View style={styles.empty}>
              <Text style={styles.h2}>Snap your first job</Text>
              <Text style={styles.body}>
                Before, during and after photos plus a line about the work. We'll write it up. About two minutes.
              </Text>
              {canAdd ? (
                <Pressable style={styles.primaryBtn} onPress={() => router.push("/projects/new")}>
                  <Text style={styles.primaryBtnText}>Start a project</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => {
          const s = statusLabel(item.status);
          return (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/projects/[id]",
                  params: { id: item.id, slug: item.slug, title: item.title, status: item.status },
                })
              }
            >
              {item.hero_url ? (
                <Image source={{ uri: item.hero_url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.pill, pillTone[s.tone]]}>
                    <Text style={[styles.pillText, pillTextTone[s.tone]]}>{s.text}</Text>
                  </View>
                  <Text style={styles.meta}>{shortDate(item.created_at)}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const pillTone = StyleSheet.create({
  live: { backgroundColor: colors.teal100 },
  wait: { backgroundColor: colors.periwinkleSoft },
  off: { backgroundColor: colors.bg2 },
});
const pillTextTone = StyleSheet.create({
  live: { color: colors.tealInk },
  wait: { color: colors.periwinkle },
  off: { color: colors.ink3 },
});

const styles = StyleSheet.create({
  page: { flex: 1, padding: spacing.lg, backgroundColor: colors.bg },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  headerBtn: { color: colors.teal, fontWeight: "700", fontSize: 16 },
  eyebrow: { ...type.eyebrow },
  h1: { ...type.display, marginTop: spacing.xs },
  h2: { ...type.h2, marginBottom: spacing.xs },
  body: { ...type.body, marginTop: spacing.xs },
  error: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  upsell: { borderColor: colors.teal300, backgroundColor: colors.teal100 },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 15 },
  empty: { padding: spacing.lg, backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.bg2 },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1, justifyContent: "center" },
  rowTitle: { ...type.h2, fontSize: 16 },
  metaRow: { marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meta: { ...type.small },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: "700" },
});
