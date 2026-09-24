import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { apiFetch, type UploadedPhoto } from "./api";
import { supabase } from "./supabase";

/**
 * Projects ("snap a job"): before / during / after photos, a line about the
 * work, an AI-drafted write-up, publish. The rules (plan limits, photo
 * checks, auto-publish, review invites) all run on pmrfp.com; this file only
 * talks to it. Taxonomy lists are public, so they come straight from
 * Supabase like the RFP board does.
 */

export const PHOTO_KINDS = ["before", "during", "after"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export interface ProjectPhoto extends UploadedPhoto {
  kind: PhotoKind;
}

export interface ProjectRow {
  id: string;
  title: string;
  status: string;
  hero_url: string | null;
  slug: string;
  created_at: string;
}

export interface ProjectPlan {
  /** False until the Projects migration is applied on the server. */
  ready: boolean;
  paid: boolean;
  /** Trade Pro + approved profile: publishing goes live right away. */
  autoPublish: boolean;
  photoLimit: number;
  /** False once a free company has used its one project. */
  canAddProject: boolean;
}

export async function listProjects(): Promise<{ projects: ProjectRow[]; plan: ProjectPlan }> {
  return apiFetch("/api/projects");
}

export interface PrivacyFlags {
  people: boolean;
  licencePlates: boolean;
  addressVisible: boolean;
  clientNameVisible: boolean;
}

export const NO_PRIVACY_FLAGS: PrivacyFlags = {
  people: false,
  licencePlates: false,
  addressVisible: false,
  clientNameVisible: false,
};

/** Same wording as the web capture form. */
export const PRIVACY_WARNING: Record<keyof PrivacyFlags, string> = {
  people: "A person's face may be visible in a photo. Crop it out or get their OK first.",
  licencePlates: "A licence plate may be readable in a photo.",
  addressVisible: "A street address or building number may be readable.",
  clientNameVisible: "The client's or building's name may show in a photo or in your text.",
};

export function anyPrivacyFlag(p: PrivacyFlags): boolean {
  return p.people || p.licencePlates || p.addressVisible || p.clientNameVisible;
}

export interface ProjectDraft {
  title: string;
  summary: string;
  challenge: string;
  approach: string;
  outcome: string;
  categorySlug: string | null;
  propertyTypeSlug: string | null;
  privacy: PrivacyFlags;
}

/** "Write it for me". Throws ApiError with a plain message on any failure. */
export async function draftProject(notes: string, photos: ProjectPhoto[]): Promise<ProjectDraft> {
  const res = await apiFetch<{ draft: ProjectDraft }>("/api/projects/draft", {
    method: "POST",
    body: { notes, photos: photos.map((p) => ({ url: p.url, kind: p.kind })) },
  });
  return res.draft;
}

export interface PublishInput {
  title: string;
  summary: string;
  challenge: string;
  approach: string;
  outcome: string;
  categorySlug: string;
  propertyTypeSlug: string;
  regionSlug: string;
  city: string;
  photos: ProjectPhoto[];
  privacy: PrivacyFlags;
  photosChecked: boolean;
  clientApproved: boolean;
}

/** live = on the profile now; otherwise it's waiting for review. */
export async function publishProject(input: PublishInput): Promise<{ id: string | null; slug: string; live: boolean }> {
  return apiFetch("/api/projects", { method: "POST", body: input });
}

export async function requestReview(projectId: string, clientName: string, clientEmail: string): Promise<void> {
  await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/review-invite`, {
    method: "POST",
    body: { clientName, clientEmail },
  });
}

// ── Taxonomy ──────────────────────────────────────────────────────────

export interface Option {
  slug: string;
  name: string;
  /** Regions only: used to group Canada / United States. */
  group?: string;
}

export interface ProjectOptions {
  categories: Option[];
  propertyTypes: Option[];
  regions: Option[];
}

/** Trade / property type / region pickers. Empty lists on error: they're optional fields. */
export async function loadOptions(): Promise<ProjectOptions> {
  const [cats, types, regions] = await Promise.all([
    supabase.from("trade_categories").select("slug,name").eq("active", true).order("sort_order"),
    supabase.from("property_types").select("slug,name").eq("active", true).order("name"),
    supabase.from("regions").select("slug,name,country").eq("active", true).order("sort_order"),
  ]);
  return {
    categories: (cats.data as Option[] | null) ?? [],
    propertyTypes: (types.data as Option[] | null) ?? [],
    regions: ((regions.data as { slug: string; name: string; country: string | null }[] | null) ?? []).map((r) => ({
      slug: r.slug,
      name: r.name,
      group: r.country ?? undefined,
    })),
  };
}

// ── Camera / library ─────────────────────────────────────────────────

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Take a photo or pick some from the library. Returns [] when the user
 * cancels or says no to the camera. The library needs no permission on
 * current iOS / Android (system photo picker); the camera does.
 */
export async function pickPhotos(source: "camera" | "library", max: number): Promise<PickedPhoto[]> {
  if (max <= 0) return [];
  try {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera is off for PMRFP",
          perm.canAskAgain
            ? "Allow the camera to snap job photos. You can also choose from your library."
            : "Turn on camera access in Settings to snap job photos, or choose from your library.",
          perm.canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Not now", style: "cancel" },
                { text: "Open Settings", onPress: () => void Linking.openSettings() },
              ],
        );
        return [];
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
      return res.canceled ? [] : res.assets.map(toPicked);
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
      allowsMultipleSelection: max > 1,
      selectionLimit: max,
      orderedSelection: true,
    });
    return res.canceled ? [] : res.assets.slice(0, max).map(toPicked);
  } catch {
    Alert.alert(
      source === "camera" ? "Camera unavailable" : "Couldn't open your photos",
      source === "camera" ? "Choose from your library instead." : "Try again, or take a new photo.",
    );
    return [];
  }
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedPhoto {
  return { uri: a.uri, width: a.width, height: a.height };
}

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.8;

/**
 * Shrink to ≤2000px JPEG before upload to save data on site. The server
 * re-encodes anyway (and strips EXIF/GPS); this is about bytes on one bar
 * of signal. Falls back to the original file if anything goes wrong.
 */
export async function shrinkPhoto(uri: string): Promise<string> {
  try {
    let image = await ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(image.width, image.height);
    if (long > MAX_EDGE) {
      const size = image.width >= image.height ? { width: MAX_EDGE } : { height: MAX_EDGE };
      image = await ImageManipulator.manipulate(image).resize(size).renderAsync();
    }
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return uri;
  }
}

// ── Display helpers ──────────────────────────────────────────────────

export function statusLabel(status: string): { text: string; tone: "live" | "wait" | "off" } {
  switch (status) {
    case "published":
      return { text: "Live", tone: "live" };
    case "pending_review":
      return { text: "In review", tone: "wait" };
    case "rejected":
      return { text: "Not approved", tone: "off" };
    case "archived":
      return { text: "Archived", tone: "off" };
    default:
      return { text: "Draft", tone: "wait" };
  }
}
