import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useHeaderHeight, usePreventRemove } from "expo-router/react-navigation";
import { useAuth } from "../../src/lib/auth";
import { uploadPhoto, type UploadedPhoto } from "../../src/lib/api";
import {
  anyPrivacyFlag,
  draftProject,
  listProjects,
  loadOptions,
  NO_PRIVACY_FLAGS,
  PHOTO_KINDS,
  pickPhotos,
  PRIVACY_WARNING,
  publishProject,
  shrinkPhoto,
  type PhotoKind,
  type PrivacyFlags,
  type ProjectOptions,
  type ProjectPhoto,
  type ProjectPlan,
} from "../../src/lib/projects";
import { OptionPicker } from "../../src/components/option-picker";
import { colors, radius, spacing, type } from "../../src/lib/theme";

/**
 * The 30-second flow, built for a phone on site with one bar of signal:
 * snap before / during / after, say what you did, "Write it for me",
 * check it, publish. Each photo shrinks on the phone, uploads on its own
 * with progress and tap-to-retry, and the server strips GPS/EXIF.
 */

const SLOT_COPY: Record<PhotoKind, { label: string; hint: string }> = {
  before: { label: "Before", hint: "The problem, as you found it" },
  during: { label: "During", hint: "The work in progress" },
  after: { label: "After", hint: "The finished job" },
};

interface LocalPhoto {
  id: string;
  kind: PhotoKind;
  preview: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  result?: UploadedPhoto;
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export default function NewProjectScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();

  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [options, setOptions] = useState<ProjectOptions>({ categories: [], propertyTypes: [], regions: [] });

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const photosRef = useRef<LocalPhoto[]>([]);
  const uploadUris = useRef(new Map<string, string>());

  const [notes, setNotes] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [challenge, setChallenge] = useState("");
  const [approach, setApproach] = useState("");
  const [outcome, setOutcome] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [propertyTypeSlug, setPropertyTypeSlug] = useState("");
  const [regionSlug, setRegionSlug] = useState("");
  const [city, setCity] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyFlags>(NO_PRIVACY_FLAGS);
  const [photosChecked, setPhotosChecked] = useState(false);
  const [clientApproved, setClientApproved] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ id: string | null; slug: string; live: boolean } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const writeUpY = useRef(0);

  const loadPlan = useCallback(async () => {
    setPlanError(null);
    try {
      setPlan((await listProjects()).plan);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Couldn't load your account.");
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadPlan();
    loadOptions().then(setOptions, () => undefined);
  }, [session, loadPlan]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Don't lose a half-done project to a stray back swipe.
  const dirty = photos.length > 0 || notes.trim() !== "" || title.trim() !== "" || challenge.trim() !== "";
  usePreventRemove(dirty && !published, ({ data }) => {
    Alert.alert("Discard this project?", "Your photos and notes won't be saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Navigate only after the render that switched the guard off.
  const navigated = useRef(false);
  useEffect(() => {
    if (!published || navigated.current) return;
    navigated.current = true;
    router.replace({
      pathname: "/projects/[id]",
      params: {
        id: published.id ?? "",
        slug: published.slug,
        title: title.trim(),
        status: published.live ? "published" : "pending_review",
        fresh: "1",
      },
    });
  }, [published, router, title]);

  const limit = plan?.photoLimit ?? 3;
  const done = photos.filter((p) => p.status === "done" && p.result);
  const uploading = photos.some((p) => p.status === "uploading");
  const remaining = limit - photos.length;
  const flagged = anyPrivacyFlag(privacy);

  function patch(id: string, next: Partial<LocalPhoto>) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  }

  async function send(id: string) {
    const uri = uploadUris.current.get(id);
    if (!uri) return;
    patch(id, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await uploadPhoto(uri, (progress) => patch(id, { progress }));
      patch(id, { status: "done", progress: 1, result });
    } catch (e) {
      patch(id, { status: "error", error: e instanceof Error ? e.message : "Upload failed. Tap to retry." });
    }
  }

  async function addPhotos(kind: PhotoKind, source: "camera" | "library") {
    const room = Math.max(0, limit - photosRef.current.length);
    if (room === 0) return;
    const picked = await pickPhotos(source, room);
    if (picked.length === 0) return;
    const fresh: LocalPhoto[] = picked.slice(0, room).map((p) => ({
      id: newId(),
      kind,
      preview: p.uri,
      status: "uploading",
      progress: 0,
    }));
    photosRef.current = [...photosRef.current, ...fresh];
    setPhotos((prev) => [...prev, ...fresh]);
    await Promise.all(
      fresh.map(async (p) => {
        uploadUris.current.set(p.id, await shrinkPhoto(p.preview));
        await send(p.id);
      }),
    );
  }

  function remove(id: string) {
    uploadUris.current.delete(id);
    photosRef.current = photosRef.current.filter((p) => p.id !== id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function writeForMe() {
    setDraftMsg(null);
    setDrafting(true);
    try {
      const d = await draftProject(
        notes,
        done.map((p) => ({ ...p.result!, kind: p.kind })),
      );
      setTitle(d.title);
      setSummary(d.summary);
      setChallenge(d.challenge);
      setApproach(d.approach);
      setOutcome(d.outcome);
      if (d.categorySlug) setCategorySlug(d.categorySlug);
      if (d.propertyTypeSlug) setPropertyTypeSlug(d.propertyTypeSlug);
      setPrivacy(d.privacy);
      setPhotosChecked(false);
      setDraftMsg({ tone: "ok", text: "Done. Read it over and fix anything that's off." });
      scrollRef.current?.scrollTo({ y: Math.max(0, writeUpY.current - spacing.lg), animated: true });
    } catch (e) {
      setDraftMsg({
        tone: "error",
        text: e instanceof Error ? e.message : "Couldn't write it right now. Write it yourself below.",
      });
    } finally {
      setDrafting(false);
    }
  }

  async function publish() {
    setPublishError(null);
    if (uploading) return setPublishError("Wait for the photos to finish uploading.");
    if (done.length === 0) return setPublishError("Add at least one photo.");
    if (flagged && !photosChecked) return setPublishError("Tick \"I've checked the photos\" to publish.");
    const ordered = PHOTO_KINDS.flatMap((k) => done.filter((p) => p.kind === k));
    const payload: ProjectPhoto[] = ordered.map((p) => ({ ...p.result!, kind: p.kind }));
    setPublishing(true);
    try {
      const res = await publishProject({
        title,
        summary,
        challenge,
        approach,
        outcome,
        categorySlug,
        propertyTypeSlug,
        regionSlug,
        city,
        photos: payload,
        privacy,
        photosChecked,
        clientApproved,
      });
      setPublished(res);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't publish. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  // ── Gates ──

  if (!session) {
    return (
      <View style={styles.pageCentre}>
        <Text style={styles.h2}>Sign in to add a project.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/sign-in")}>
          <Text style={styles.primaryBtnText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={styles.pageCentre}>
        {planError ? (
          <>
            <Text style={styles.h2}>{planError}</Text>
            <Pressable style={styles.primaryBtn} onPress={loadPlan}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.indigo} />
        )}
      </View>
    );
  }
  if (!plan.ready || !plan.canAddProject) {
    return (
      <View style={styles.pageCentre}>
        <Text style={styles.h2}>
          {plan.ready ? "You've used your free project" : "Photo projects are switching on soon"}
        </Text>
        <Text style={[styles.body, styles.centreText]}>
          {plan.ready
            ? "Trade Pro lets you add every job you're proud of, with up to 24 photos each."
            : "Check back shortly."}
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back to projects</Text>
        </Pressable>
      </View>
    );
  }

  const canDraft = !drafting && !uploading && (done.length > 0 || notes.trim().length > 0);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* ── 1. Photos ── */}
        <StepHeading n={1} title="Photos">
          {plan.paid ? "Before, during and after. The after shot becomes the cover." : `Free plan: up to ${limit} photos.`}
        </StepHeading>
        {PHOTO_KINDS.map((kind) => (
          <PhotoSlot
            key={kind}
            kind={kind}
            photos={photos.filter((p) => p.kind === kind)}
            full={remaining <= 0}
            onAdd={(source) => addPhotos(kind, source)}
            onRemove={remove}
            onRetry={send}
          />
        ))}
        {remaining <= 0 ? (
          <Text style={styles.note}>
            {plan.paid ? `That's ${limit} photos, the most per project.` : "That's the free-plan limit. Trade Pro allows up to 24."}
          </Text>
        ) : null}

        {/* ── 2. Notes + AI ── */}
        <StepHeading n={2} title="What did you do?">
          A line or two is plenty. Size, building type, city, anything tricky.
        </StepHeading>
        <Field
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={3000}
          placeholder="Replaced the flat roof on a 24,000 sq ft warehouse in Mississauga. Found rotten deck at two drains. Done in 9 days with tenants open."
          style={styles.multiline}
        />
        <Pressable
          style={[styles.aiBtn, !canDraft && styles.btnDisabled]}
          disabled={!canDraft}
          onPress={writeForMe}
          accessibilityRole="button"
        >
          {drafting ? <ActivityIndicator color={colors.paper} /> : null}
          <Text style={styles.aiBtnText}>{drafting ? "Reading your photos…" : "✦ Write it for me"}</Text>
        </Pressable>
        <Text style={styles.hint}>
          {uploading ? "Waiting for photos to finish…" : "Uses your photos and notes. You can edit everything."}
        </Text>
        {draftMsg ? (
          <Text style={[styles.callout, draftMsg.tone === "ok" ? styles.calloutOk : styles.calloutWarn]}>{draftMsg.text}</Text>
        ) : null}

        {/* ── 3. Write-up ── */}
        <View onLayout={(e) => (writeUpY.current = e.nativeEvent.layout.y)}>
          <StepHeading n={3} title="The write-up">
            This is what property managers read. Plain and specific beats polished.
          </StepHeading>
        </View>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={140}
          placeholder="Flat roof replacement, 24,000 sq ft warehouse, Mississauga" />
        <Field label="Summary (optional)" value={summary} onChangeText={setSummary} maxLength={400} multiline style={styles.multilineShort} />
        <Field label="The challenge" value={challenge} onChangeText={setChallenge} maxLength={3000} multiline
          style={styles.multiline} placeholder="What was wrong, and what made it hard?" />
        <Field label="What you did" value={approach} onChangeText={setApproach} maxLength={3000} multiline
          style={styles.multiline} placeholder="How you tackled it, and why." />
        <Field label="The result" value={outcome} onChangeText={setOutcome} maxLength={3000} multiline
          style={styles.multiline} placeholder="What got delivered, how long it took, what changed for the building." />
        <OptionPicker label="Trade" value={categorySlug} options={options.categories} onChange={setCategorySlug} />
        <OptionPicker label="Property type" value={propertyTypeSlug} options={options.propertyTypes} onChange={setPropertyTypeSlug} />
        <Field label="City" value={city} onChangeText={setCity} maxLength={80} placeholder="Mississauga" textContentType="addressCity" />
        <OptionPicker label="Region" value={regionSlug} options={options.regions} onChange={setRegionSlug} />

        {/* ── Privacy + consent ── */}
        {flagged ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Check before you publish</Text>
            {(Object.keys(PRIVACY_WARNING) as (keyof PrivacyFlags)[])
              .filter((k) => privacy[k])
              .map((k) => (
                <Text key={k} style={styles.warnItem}>
                  • {PRIVACY_WARNING[k]}
                </Text>
              ))}
            <ToggleRow value={photosChecked} onChange={setPhotosChecked} label="I've checked the photos and the text." strong />
          </View>
        ) : null}
        <ToggleRow
          value={clientApproved}
          onChange={setClientApproved}
          label="The client is OK with us sharing this project."
          hint="Don't name the client or show the address unless they said yes."
        />

        {/* ── Publish ── */}
        {publishError ? <Text style={[styles.callout, styles.calloutError]}>{publishError}</Text> : null}
        <Pressable
          style={[styles.primaryBtn, styles.publishBtn, (publishing || uploading || (flagged && !photosChecked)) && styles.btnDisabled]}
          disabled={publishing || uploading || (flagged && !photosChecked)}
          onPress={publish}
        >
          {publishing ? <ActivityIndicator color={colors.paper} /> : null}
          <Text style={styles.primaryBtnText}>{plan.autoPublish ? "Publish project" : "Send for review"}</Text>
        </Pressable>
        <Text style={[styles.hint, styles.centreText]}>
          {plan.autoPublish ? "Goes live on your profile right away." : "We check it before it goes live, usually within a day."}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function StepHeading({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRow}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Text style={styles.h2}>{title}</Text>
      </View>
      {children ? <Text style={styles.small}>{children}</Text> : null}
    </View>
  );
}

function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={label ? styles.fieldWrap : undefined}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.ink3}
        textAlignVertical={props.multiline ? "top" : "center"}
        {...props}
        style={[styles.input, style]}
      />
    </View>
  );
}

function ToggleRow({
  value,
  onChange,
  label,
  hint,
  strong,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={styles.toggleText}>
        <Text style={[styles.body, strong && styles.strong]}>{label}</Text>
        {hint ? <Text style={styles.small}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.teal, false: colors.borderStrong }}
        thumbColor={colors.paper}
      />
    </Pressable>
  );
}

function PhotoSlot({
  kind,
  photos,
  full,
  onAdd,
  onRemove,
  onRetry,
}: {
  kind: PhotoKind;
  photos: LocalPhoto[];
  full: boolean;
  onAdd: (source: "camera" | "library") => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const copy = SLOT_COPY[kind];
  return (
    <View style={styles.slot}>
      <View style={styles.slotHead}>
        <Text style={styles.slotLabel}>{copy.label}</Text>
        <Text style={styles.small}>{copy.hint}</Text>
      </View>

      {photos.length > 0 ? (
        <View style={styles.thumbs}>
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} onRemove={() => onRemove(p.id)} onRetry={() => onRetry(p.id)} />
          ))}
        </View>
      ) : null}

      <Pressable
        style={[styles.snapBtn, photos.length === 0 && styles.snapBtnBig, full && styles.btnDisabled]}
        disabled={full}
        onPress={() => onAdd("camera")}
        accessibilityRole="button"
      >
        <Text style={styles.snapBtnText}>
          {photos.length === 0 ? `Take ${copy.label.toLowerCase()} photo` : "Add another"}
        </Text>
      </Pressable>
      <Pressable disabled={full} onPress={() => onAdd("library")} hitSlop={8}>
        <Text style={[styles.libraryLink, full && styles.btnDisabled]}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

function Thumb({ photo, onRemove, onRetry }: { photo: LocalPhoto; onRemove: () => void; onRetry: () => void }) {
  const pct = Math.round(photo.progress * 100);
  return (
    <View style={styles.thumb}>
      <Image source={{ uri: photo.preview }} style={[styles.thumbImg, photo.status !== "done" && styles.dim]} />

      {photo.status === "uploading" ? (
        <View style={styles.thumbOverlay} accessibilityLabel={`Uploading, ${pct}%`}>
          <Text style={styles.thumbPct}>{pct}%</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.max(4, pct)}%` }]} />
          </View>
        </View>
      ) : null}

      {photo.status === "done" ? (
        <View style={styles.doneBadge}>
          <Text style={styles.doneBadgeText}>✓</Text>
        </View>
      ) : null}

      {photo.status === "error" ? (
        <Pressable style={[styles.thumbOverlay, styles.errorOverlay]} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryIcon}>↻</Text>
          <Text style={styles.errorText} numberOfLines={3}>
            {photo.error ?? "Tap to retry"}
          </Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8} accessibilityLabel="Remove photo">
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
}

const THUMB = 96;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  page: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, backgroundColor: colors.bg },
  pageCentre: { flex: 1, padding: spacing.xl, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  centreText: { textAlign: "center" },
  h2: { ...type.h2 },
  body: { ...type.body },
  small: { ...type.small, marginTop: spacing.xs },
  strong: { fontWeight: "700", color: colors.warnInk },
  note: { ...type.small, color: colors.warnInk, marginTop: spacing.xs },
  hint: { ...type.small, marginTop: spacing.sm },

  step: { marginTop: spacing.xl, marginBottom: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.paper, fontSize: 12, fontWeight: "700" },

  slot: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  slotHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm },
  slotLabel: { fontSize: 15, fontWeight: "700", color: colors.indigo },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  snapBtn: {
    marginTop: spacing.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  snapBtnBig: { paddingVertical: spacing.xxl },
  snapBtnText: { color: colors.indigo, fontWeight: "700", fontSize: 16 },
  libraryLink: { color: colors.tealInk, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },

  thumb: { width: THUMB, height: THUMB, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.bg2 },
  thumbImg: { width: "100%", height: "100%" },
  dim: { opacity: 0.6 },
  thumbOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
  },
  thumbPct: { color: colors.paper, fontWeight: "700", fontSize: 13, textShadowColor: "rgba(0,0,0,.6)", textShadowRadius: 3 },
  bar: { width: "70%", height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,.35)", marginTop: spacing.xs },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.paper },
  doneBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.tealInk,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBadgeText: { color: colors.paper, fontSize: 12, fontWeight: "700" },
  errorOverlay: { backgroundColor: "rgba(0,0,0,.6)" },
  retryIcon: { color: colors.paper, fontSize: 18, fontWeight: "700" },
  errorText: { color: colors.paper, fontSize: 10, fontWeight: "600", textAlign: "center" },
  removeBtn: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.paper, fontSize: 16, lineHeight: 18, fontWeight: "700" },

  fieldWrap: { marginTop: spacing.md },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.ink,
    backgroundColor: colors.paper,
    fontSize: 16,
  },
  multiline: { minHeight: 110 },
  multilineShort: { minHeight: 64 },

  aiBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  aiBtnText: { color: colors.teal, fontWeight: "700", fontSize: 16 },

  callout: { marginTop: spacing.md, borderRadius: radius.md, padding: spacing.md, fontSize: 14, overflow: "hidden" },
  calloutOk: { backgroundColor: colors.teal100, color: colors.tealInk },
  calloutWarn: { backgroundColor: colors.warnBg, color: colors.warnInk },
  calloutError: { backgroundColor: colors.errorBg, color: colors.error },

  warnBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.warnBg,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warnTitle: { fontWeight: "700", color: colors.warnInk, fontSize: 15, marginBottom: spacing.xs },
  warnItem: { color: colors.warnInk, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  toggleText: { flex: 1 },

  primaryBtn: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.indigo,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  publishBtn: { paddingVertical: spacing.lg },
  primaryBtnText: { color: colors.paper, fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.indigo, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.45 },
});
