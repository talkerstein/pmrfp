"use client";

/**
 * RFP photo uploader. Multi-file picker + thumbnail grid + delete.
 *
 * Uploads images DIRECTLY from the browser to Supabase Storage (rfp-photos
 * public bucket) using the user's session — no Next route handler needed.
 * The uploaded URLs are emitted as repeated hidden form inputs (name="photoUrls")
 * so the existing server-action form pipeline picks them up on submit.
 *
 * Why direct browser upload (not via server action):
 *   - Server actions have a 4.5 MB body cap by default — multi-photo posts
 *     would routinely exceed that.
 *   - Direct upload streams to Storage; we get progress + don't bloat memory.
 *   - Public bucket + RLS insert policy keeps it secure (authed users only).
 */
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, X, Loader2, AlertTriangle } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 8;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per photo
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

interface UploadedPhoto {
  url: string;
  path: string;
  size: number;
  type: string;
}

export function RfpPhotoUploader({
  organizationId,
  label = "Property photos (optional)",
  helpText = "Show trades what the building / area looks like. JPEG, PNG, or WebP. Max 8 photos, 5 MB each.",
}: {
  organizationId: string | null;
  label?: string;
  helpText?: string;
}) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePick() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!organizationId) {
      setError("Complete your organization profile before uploading photos.");
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) {
      setError(`Max ${MAX_PHOTOS} photos. Remove one to upload more.`);
      return;
    }
    for (const f of files) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError(`"${f.name}" — only JPEG, PNG, WebP, or HEIC images are allowed.`);
        return;
      }
      if (f.size > MAX_SIZE_BYTES) {
        setError(`"${f.name}" is over 5 MB. Compress and try again.`);
        return;
      }
    }

    startTransition(async () => {
      const supabase = createBrowserClient();
      const uploaded: UploadedPhoto[] = [];
      for (const f of files) {
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const id = crypto.randomUUID();
        const path = `${organizationId}/pending/${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("rfp-photos").upload(path, f, {
          contentType: f.type,
          upsert: false,
        });
        if (upErr) {
          setError(`Upload failed for "${f.name}": ${upErr.message}`);
          break;
        }
        const { data: pub } = supabase.storage.from("rfp-photos").getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, path, size: f.size, type: f.type });
      }
      if (uploaded.length) {
        setPhotos((prev) => [...prev, ...uploaded]);
      }
    });
  }

  async function removePhoto(idx: number) {
    const target = photos[idx];
    if (!target) return;
    // Optimistic remove from UI; best-effort delete from storage.
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    try {
      const supabase = createBrowserClient();
      await supabase.storage.from("rfp-photos").remove([target.path]);
    } catch {
      // Non-fatal: orphaned object is fine; admin can clean up later.
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{helpText}</p>

      {/* Hidden inputs — picked up by the server action via formData.getAll("photoUrls"). */}
      {photos.map((p) => (
        <input key={p.url} type="hidden" name="photoUrls" value={p.url} />
      ))}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div
            key={p.url}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/40"
          >
            {/* Using native <img> for previews to avoid Next image optimization noise on
                user-uploaded URLs that aren't yet in the remotePatterns allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-black/85 focus:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={handlePick}
            disabled={isPending}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card text-sm text-muted-foreground transition-colors",
              "hover:border-teal-400 hover:bg-teal-50 hover:text-teal-ink",
              isPending && "cursor-wait opacity-60",
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <ImagePlus className="size-6" />
                {photos.length === 0 ? "Add photos" : "Add more"}
              </>
            )}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {photos.length}/{MAX_PHOTOS} uploaded · Tip: 2-4 wide shots beats 8 close-ups
      </p>

      {!organizationId && (
        <p className="mt-2 text-xs text-amber-700">
          Photo upload requires a complete company profile.
        </p>
      )}
    </div>
  );
}

// Image import is intentionally unused — kept for future migration to next/image
// once we add the storage hostname to next.config.ts remotePatterns.
void Image;
