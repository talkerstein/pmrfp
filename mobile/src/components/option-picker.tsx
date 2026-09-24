import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Option } from "../lib/projects";
import { colors, radius, spacing, type } from "../lib/theme";

type Row = { kind: "header"; label: string } | { kind: "option"; option: Option };

/**
 * A select field for React Native: shows the chosen name, opens a sheet of
 * options. Options with a `group` (regions: Canada / United States) get
 * section headers when there's more than one group.
 */
export function OptionPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.slug === value);

  const rows = useMemo<Row[]>(() => {
    const groups = [...new Set(options.map((o) => o.group ?? ""))];
    if (groups.length <= 1) return options.map((option) => ({ kind: "option", option }));
    return groups.flatMap((g) => [
      { kind: "header" as const, label: g || "Other" },
      ...options.filter((o) => (o.group ?? "") === g).map((option) => ({ kind: "option" as const, option })),
    ]);
  }, [options]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.field}
        onPress={() => setOpen(true)}
        disabled={options.length === 0}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? "not set"}`}
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected?.name ?? (options.length ? "Select…" : "Loading…")}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={[{ kind: "option", option: { slug: "", name: "Not set" } } as Row, ...rows]}
            keyExtractor={(r, i) => (r.kind === "header" ? `h-${r.label}` : `o-${r.option.slug || "none"}-${i}`)}
            renderItem={({ item }) =>
              item.kind === "header" ? (
                <Text style={styles.groupHeader}>{item.label}</Text>
              ) : (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onChange(item.option.slug);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.rowText, item.option.slug === value && styles.rowTextOn]}>{item.option.name}</Text>
                  {item.option.slug === value ? <Text style={styles.tick}>✓</Text> : null}
                </Pressable>
              )
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  field: {
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
  },
  value: { flex: 1, fontSize: 16, color: colors.ink },
  placeholder: { flex: 1, fontSize: 16, color: colors.ink3 },
  chevron: { color: colors.ink3, fontSize: 14, marginLeft: spacing.sm },
  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.paper,
  },
  sheetTitle: { ...type.h2 },
  done: { color: colors.tealInk, fontWeight: "700", fontSize: 16 },
  groupHeader: { ...type.eyebrow, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.paper,
  },
  rowText: { flex: 1, fontSize: 16, color: colors.ink },
  rowTextOn: { fontWeight: "700", color: colors.indigo },
  tick: { color: colors.tealInk, fontSize: 16, fontWeight: "700" },
});
