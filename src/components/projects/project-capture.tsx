"use client";

/**
 * Project capture: before / during / after photos from the phone camera,
 * one line about the job, and "Write it for me" turns both into an editable
 * case study. Built for a contractor standing on site with one bar of signal:
 *   - photos shrink in the browser (~2000px JPEG) before they upload, then
 *     the server re-encodes them and strips GPS/EXIF (api/projects/photos);
 *   - each photo uploads on its own with a progress ring and tap-to-retry;
 *   - every AI field stays editable, and the form works without the AI.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { publishProjectAction } from "@/lib/projects/actions";
import {
  anyPrivacyFlag,
  NO_PRIVACY_FLAGS,
  PRIVACY_WARNING,
  type PrivacyFlags,
  type ProjectDraft,
} from "@/lib/projects/draft";
import { PHOTO_KINDS, type PhotoKind, type ProjectPhoto } from "@/lib/projects/photos";
import { cn } from "@/lib/utils";

const CLIENT_MAX_EDGE = 2000;
const CLIENT_QUALITY = 0.85;

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
  result?: { url: string; path: string; width: number; height: number };
}

interface Option {
  slug: string;
  name: string;
}

interface RegionOption extends Option {
  country: string;
}

// ── Browser-side image shrink ─────────────────────────────────────────

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: no options bag. Fall back to an <img>, which also
    // respects EXIF orientation in current browsers.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Shrink to ≤2000px JPEG to save data on site. Falls back to the original file. */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await decode(file);
    const w0 = "naturalWidth" in img ? img.naturalWidth : img.width;
    const h0 = "naturalHeight" in img ? img.naturalHeight : img.height;
    const scale = Math.min(1, CLIENT_MAX_EDGE / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if ("close" in img) img.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", CLIENT_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function upload(blob: Blob, onProgress: (p: number) => void): Promise<NonNullable<LocalPhoto["result"]>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects/photos");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { url?: string; path?: string; width?: number; height?: number; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON (e.g. the platform's 413 page).
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url && body.path && body.width && body.height) {
        resolve({ url: body.url, path: body.path, width: body.width, height: body.height });
      } else {
        reject(
          new Error(
            body.error ??
              (xhr.status === 413 ? "That photo is too big. Try a smaller one." : "Upload failed. Tap to retry."),
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("No connection. Tap to retry."));
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    xhr.send(fd);
  });
}

// ── Component ─────────────────────────────────────────────────────────

export function ProjectCapture({
  paid,
  photoLimit,
  categories,
  propertyTypes,
  regions,
}: {
  paid: boolean;
  photoLimit: number;
  categories: Option[];
  propertyTypes: Option[];
  regions: RegionOption[];
}) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const blobs = useRef(new Map<string, Blob>());

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

  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const writeUpRef = useRef<HTMLElement>(null);

  // Latest photos for async callbacks, and to free object URLs on the way out.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const done = photos.filter((p) => p.status === "done" && p.result);
  const uploading = photos.some((p) => p.status === "uploading");
  const remaining = photoLimit - photos.length;

  function patch(id: string, next: Partial<LocalPhoto>) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));
  }

  async function send(id: string) {
    const blob = blobs.current.get(id);
    if (!blob) return;
    patch(id, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await upload(blob, (progress) => patch(id, { progress }));
      patch(id, { status: "done", progress: 1, result });
      blobs.current.delete(id);
    } catch (err) {
      patch(id, { status: "error", error: err instanceof Error ? err.message : "Upload failed. Tap to retry." });
    }
  }

  async function addFiles(kind: PhotoKind, list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "");
    const room = Math.max(0, photoLimit - photosRef.current.length);
    const accepted = files.slice(0, room);
    setPhotoMsg(
      files.length > room
        ? paid
          ? `Up to ${photoLimit} photos per project. We added the first ${room}.`
          : `The free plan allows ${photoLimit} photos per project. We added the first ${room}.`
        : null,
    );
    const fresh: LocalPhoto[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      kind,
      preview: URL.createObjectURL(f),
      status: "uploading",
      progress: 0,
    }));
    photosRef.current = [...photosRef.current, ...fresh];
    setPhotos((prev) => [...prev, ...fresh]);
    await Promise.all(
      fresh.map(async (p, i) => {
        blobs.current.set(p.id, await shrink(accepted[i]));
        await send(p.id);
      }),
    );
  }

  function remove(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
    blobs.current.delete(id);
  }

  async function writeForMe() {
    setDraftMsg(null);
    setDrafting(true);
    try {
      const res = await fetch("/api/projects/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          photos: done.map((p) => ({ url: p.result!.url, kind: p.kind })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { draft?: ProjectDraft; error?: string };
      if (!res.ok || !body.draft) {
        setDraftMsg({ tone: "error", text: body.error ?? "Couldn't write it right now. Write it yourself below." });
        return;
      }
      const d = body.draft;
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
      writeUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setDraftMsg({ tone: "error", text: "Couldn't write it right now. Write it yourself below." });
    } finally {
      setDrafting(false);
    }
  }

  function publish() {
    setPublishError(null);
    if (uploading) return setPublishError("Wait for the photos to finish uploading.");
    if (done.length === 0) return setPublishError("Add at least one photo.");
    const ordered = PHOTO_KINDS.flatMap((k) => done.filter((p) => p.kind === k));
    const payload: ProjectPhoto[] = ordered.map((p) => ({ ...p.result!, kind: p.kind }));
    startPublish(async () => {
      const res = await publishProjectAction({
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
      if (res?.error) setPublishError(res.error);
    });
  }

  const flagged = anyPrivacyFlag(privacy);
  const canDraft = !drafting && !uploading && (done.length > 0 || notes.trim().length > 0);
  const regionGroups = groupByCountry(regions);

  const field =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base sm:text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";
  const label = "block text-sm font-medium";

  return (
    <div className="max-w-3xl pb-4">
      {/* ── 1. Photos ── */}
      <section aria-labelledby="photos-h">
        <StepHeading id="photos-h" n={1} title="Photos">
          {paid ? "Before, during and after. The after shot becomes the cover." : `Free plan: up to ${photoLimit} photos.`}
        </StepHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          {PHOTO_KINDS.map((kind) => (
            <PhotoSlot
              key={kind}
              kind={kind}
              photos={photos.filter((p) => p.kind === kind)}
              full={remaining <= 0}
              onFiles={(files) => addFiles(kind, files)}
              onRemove={remove}
              onRetry={send}
            />
          ))}
        </div>
        {photoMsg && <p className="mt-2 text-sm text-amber-800">{photoMsg}</p>}
        {remaining <= 0 && !paid && (
          <p className="mt-2 text-sm text-muted-foreground">
            That&apos;s the free-plan limit.{" "}
            <a href="/pricing" className="font-medium text-teal-ink hover:underline">Trade Pro</a> adds up to 24
            photos per project, more projects, and client reviews.
          </p>
        )}
      </section>

      {/* ── 2. Notes + AI ── */}
      <section aria-labelledby="notes-h" className="mt-8">
        <StepHeading id="notes-h" n={2} title="What did you do?">
          A line or two is plenty. Size, building type, city, anything tricky.
        </StepHeading>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={3000}
          className={field}
          placeholder="Replaced the flat roof on a 24,000 sq ft warehouse in Mississauga. Found rotten deck at two drains and fixed it. Done in 9 days with tenants open."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={writeForMe}
            disabled={!canDraft}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-indigo px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-teal-300" />}
            {drafting ? "Reading your photos…" : "Write it for me"}
          </button>
          <span className="text-xs text-muted-foreground">
            {uploading ? "Waiting for photos to finish…" : "Uses your photos and notes. You can edit everything."}
          </span>
        </div>
        {draftMsg && (
          <p
            role="status"
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              draftMsg.tone === "ok" ? "bg-teal-50 text-teal-ink" : "bg-amber-50 text-amber-800",
            )}
          >
            {draftMsg.tone === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {draftMsg.text}
          </p>
        )}
      </section>

      {/* ── 3. Write-up ── */}
      <section aria-labelledby="writeup-h" className="mt-8 scroll-mt-6" ref={writeUpRef}>
        <StepHeading id="writeup-h" n={3} title="The write-up">
          This is what property managers read. Plain and specific beats polished.
        </StepHeading>
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className={label}>Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              className={field}
              placeholder="Flat roof replacement, 24,000 sq ft warehouse, Mississauga"
            />
          </div>
          <div>
            <label htmlFor="summary" className={label}>
              Summary <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={400} className={field} />
          </div>
          <div>
            <label htmlFor="challenge" className={label}>The challenge</label>
            <textarea id="challenge" value={challenge} onChange={(e) => setChallenge(e.target.value)} rows={4} maxLength={3000} className={field}
              placeholder="What was wrong, and what made it hard?" />
          </div>
          <div>
            <label htmlFor="approach" className={label}>What you did</label>
            <textarea id="approach" value={approach} onChange={(e) => setApproach(e.target.value)} rows={4} maxLength={3000} className={field}
              placeholder="How you tackled it, and why." />
          </div>
          <div>
            <label htmlFor="outcome" className={label}>The result</label>
            <textarea id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={4} maxLength={3000} className={field}
              placeholder="What got delivered, how long it took, what changed for the building." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="category" className={label}>Trade</label>
              <select id="category" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className={field}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="propertyType" className={label}>Property type</label>
              <select id="propertyType" value={propertyTypeSlug} onChange={(e) => setPropertyTypeSlug(e.target.value)} className={field}>
                <option value="">Select…</option>
                {propertyTypes.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="city" className={label}>City</label>
              <input id="city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} className={field} placeholder="Mississauga" autoComplete="address-level2" />
            </div>
            <div>
              <label htmlFor="region" className={label}>Region</label>
              <select id="region" value={regionSlug} onChange={(e) => setRegionSlug(e.target.value)} className={field}>
                <option value="">Select…</option>
                {regionGroups.map((g) =>
                  regionGroups.length > 1 ? (
                    <optgroup key={g.country} label={g.country}>
                      {g.regions.map((r) => (
                        <option key={r.slug} value={r.slug}>{r.name}</option>
                      ))}
                    </optgroup>
                  ) : (
                    g.regions.map((r) => (
                      <option key={r.slug} value={r.slug}>{r.name}</option>
                    ))
                  ),
                )}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy + consent ── */}
      <section className="mt-8 space-y-3">
        {flagged && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" /> Check before you publish
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(Object.keys(PRIVACY_WARNING) as (keyof PrivacyFlags)[])
                .filter((k) => privacy[k])
                .map((k) => (
                  <li key={k}>{PRIVACY_WARNING[k]}</li>
                ))}
            </ul>
            <label className="mt-3 flex items-start gap-2.5 font-medium">
              <input
                type="checkbox"
                checked={photosChecked}
                onChange={(e) => setPhotosChecked(e.target.checked)}
                className="mt-0.5 size-5 accent-teal-700"
              />
              I&apos;ve checked the photos and the text.
            </label>
          </div>
        )}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={clientApproved}
            onChange={(e) => setClientApproved(e.target.checked)}
            className="mt-0.5 size-5 accent-teal-700"
          />
          <span>
            The client is OK with us sharing this project.
            <span className="block text-xs text-muted-foreground">
              Don&apos;t name the client or show the address unless they said yes.
            </span>
          </span>
        </label>
      </section>

      {/* ── Publish (sticky on phones) ── */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-border bg-background/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {publishError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {publishError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={publish}
            disabled={publishing || uploading || (flagged && !photosChecked)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 sm:flex-none"
          >
            {publishing && <Loader2 className="size-4 animate-spin" />}
            {paid ? "Publish project" : "Send for review"}
          </button>
          <span className="text-xs text-muted-foreground">
            {paid
              ? "Goes live on your profile right away."
              : "We check free-plan projects before they go live, usually within a day."}
          </span>
        </div>
      </div>
    </div>
  );
}

function groupByCountry(regions: RegionOption[]): { country: string; regions: RegionOption[] }[] {
  const map = new Map<string, RegionOption[]>();
  for (const r of regions) {
    const key = r.country || "Other";
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([country, list]) => ({ country, regions: list }));
}

function StepHeading({ id, n, title, children }: { id: string; n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="flex size-6 items-center justify-center rounded-full bg-indigo text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

function PhotoSlot({
  kind,
  photos,
  full,
  onFiles,
  onRemove,
  onRetry,
}: {
  kind: PhotoKind;
  photos: LocalPhoto[];
  full: boolean;
  onFiles: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const copy = SLOT_COPY[kind];

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!full) ref.current?.click();
  };
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(e.target.files);
    e.target.value = ""; // same photo can be picked again after removing it
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{copy.label}</h3>
        <span className="text-xs text-muted-foreground">{copy.hint}</span>
      </div>

      {/* Camera on phones (capture), file picker on desktop. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={handle} />
      {/* Same, without capture: lets phones pick shots already taken. */}
      <input ref={libraryRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={handle} />

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-2">
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} onRemove={() => onRemove(p.id)} onRetry={() => onRetry(p.id)} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => pick(cameraRef)}
        disabled={full}
        className={cn(
          "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors",
          "hover:border-teal-400 hover:bg-teal-50 hover:text-teal-ink disabled:cursor-not-allowed disabled:opacity-50",
          photos.length === 0 && "py-8",
        )}
      >
        <Camera className="size-5" />
        {photos.length === 0 ? `Take ${copy.label.toLowerCase()} photo` : "Add another"}
      </button>
      <button
        type="button"
        onClick={() => pick(libraryRef)}
        disabled={full}
        className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-teal-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="size-3.5" /> Choose from library
      </button>
    </div>
  );
}

function Thumb({ photo, onRemove, onRetry }: { photo: LocalPhoto; onRemove: () => void; onRetry: () => void }) {
  const pct = Math.round(photo.progress * 100);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img src={photo.preview} alt="" className={cn("size-full object-cover", photo.status !== "done" && "opacity-60")} />

      {photo.status === "uploading" && (
        <div className="absolute inset-0 flex items-center justify-center" aria-label={`Uploading, ${pct}%`}>
          <svg viewBox="0 0 36 36" className="size-10 -rotate-90 drop-shadow">
            <circle cx="18" cy="18" r="15" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(4, pct) * 0.9425} 94.25`}
              className="transition-[stroke-dasharray] duration-200"
            />
          </svg>
        </div>
      )}

      {photo.status === "done" && (
        <span className="absolute bottom-1 left-1 rounded-full bg-teal-600 p-0.5 text-white">
          <Check className="size-3" />
        </span>
      )}

      {photo.status === "error" && (
        <button
          type="button"
          onClick={onRetry}
          title={photo.error}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 p-1 text-center text-[11px] font-medium leading-tight text-white"
        >
          <RotateCw className="size-4" />
          {photo.error ?? "Tap to retry"}
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black/85"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
