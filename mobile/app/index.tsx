import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuth } from "../src/lib/auth";
import { deadlineLabel, listRfps, type RfpTeaser } from "../src/lib/rfps";
import { colors, radius, spacing, type } from "../src/lib/theme";

export default function BoardScreen() {
  const [rfps, setRfps] = useState<RfpTeaser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { session } = useAuth();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      setError(null);
      setRfps(await listRfps());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!rfps && !error) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.indigo} />
      </View>
    );
  }

  return (
    <FlatList
      data={rfps ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.indigo} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Commercial property</Text>
          <Text style={styles.h1}>Open RFPs</Text>
          <Pressable
            onPress={() => router.push(session ? "/account" : "/sign-in")}
            style={styles.headerLink}
          >
            <Text style={styles.headerLinkText}>
              {session ? "Account" : "Sign in"}
            </Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.h2}>{error ? "Something went wrong" : "Nothing open right now"}</Text>
          <Text style={styles.body}>
            {error ?? "New opportunities land here as property managers post them. Pull down to refresh."}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: "/rfp/[id]", params: { id: item.id } }} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.summary ? (
              <Text style={styles.body} numberOfLines={2}>
                {item.summary}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {[item.city, item.province].filter(Boolean).join(", ") || "Region not set"}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{deadlineLabel(item.deadline)}</Text>
              </View>
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  eyebrow: { ...type.eyebrow },
  h1: { ...type.display, marginTop: spacing.xs },
  h2: { ...type.h2, marginBottom: spacing.sm },
  body: { ...type.body, marginTop: spacing.xs },
  headerLink: { marginTop: spacing.md, alignSelf: "flex-start" },
  headerLinkText: { color: colors.tealInk, fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { ...type.h2, marginBottom: spacing.xs },
  metaRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  meta: { ...type.small, flexShrink: 1 },
  pill: {
    backgroundColor: colors.teal100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: { color: colors.tealInk, fontSize: 12, fontWeight: "700" },
  empty: { padding: spacing.lg, alignItems: "flex-start" },
});
