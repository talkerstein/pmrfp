"use client";

/**
 * Trade portfolio uploader. Multi-image, uploads directly to the existing
 * `logos` public bucket under a convention-based path:
 *
 *   logos/{orgId}/portfolio-{uuid}.{ext}
 *
 * No DB migration needed — we list objects by prefix at read time on the
 * vendor profile. If the program proves out, a future migration introduces
 * `organization_photos` with proper ordering + captions.
 *
 * Behavior mirrors RfpPhotoUploader (multi-pick, thumbnails, delete) so the
 * patterns are consistent across the platform.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, X, Loader2, AlertTriangle } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 12;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

interface PortfolioPhoto {
  url: string;
  path: string;
}

export function PortfolioUploader({
  organizationId,
  label = "Portfolio photos",
  helpText = "Show past work — projects, sites, finished installs. JPEG, PNG, or WebP. Max 12 photos, 5 MB each.",
}: {
  organizationId: string | null;
  label?: string;
  helpText?: string;
}) {
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial load — list existing portfolio objects in the org's prefix.
  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data, error: listErr } = await supabase.storage
          .from("logos")
          .list(organizationId, {
            limit: 100,
            search: "portfolio-",
            sortBy: { column: "created_at", order: "asc" },
          });
        if (cancelled) return;
        if (listErr) {
          setError(`Could not load existing photos: ${listErr.message}`);
          setLoading(false);
          return;
        }
        const items = (data ?? [])
          .filter((o) => o.name.startsWith("portfolio-"))
          .map((o) => {
            const path = `${organizationId}/${o.name}`;
            return {
              path,
              url: `${SUPABASE_URL}/storage/v1/object/public/logos/${path}`,
            };
          });
        setPhotos(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load photos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  function pick() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!organizationId) {
      setError("Save your basic profile first, then upload portfolio photos.");
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
        setError(`"${f.name}" — only JPEG, PNG, WebP, or HEIC are allowed.`);
        return;
      }
      if (f.size > MAX_SIZE_BYTES) {
        setError(`"${f.name}" is over 5 MB. Compress and try again.`);
        return;
      }
    }

    startUpload(async () => {
      const supabase = createBrowserClient();
      const uploaded: PortfolioPhoto[] = [];
      for (const f of files) {
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const id = crypto.randomUUID();
        const path = `${organizationId}/portfolio-${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("logos").upload(path, f, {
          contentType: f.type,
          upsert: false,
          cacheControl: "31536000",
        });
        if (upErr) {
          setError(`Upload failed for "${f.name}": ${upErr.message}`);
          break;
        }
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, path });
      }
      if (uploaded.length) setPhotos((prev) => [...prev, ...uploaded]);
    });
  }

  async function remove(idx: number) {
    const t = photos[idx];
    if (!t) return;
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    try {
      const supabase = createBrowserClient();
      await supabase.storage.from("logos").remove([t.path]);
    } catch {
      // Best-effort; orphans are cleaned up admin-side later.
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{helpText}</p>

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

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-secondary/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div
              key={p.path}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/40"
            >
              <Image
                src={p.url}
                alt=""
                fill
                sizes="200px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
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
              onClick={pick}
              disabled={isUploading}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card text-sm text-muted-foreground transition-colors",
                "hover:border-teal-400 hover:bg-teal-50 hover:text-teal-ink",
                isUploading && "cursor-wait opacity-60",
              )}
            >
              {isUploading ? (
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
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {photos.length}/{MAX_PHOTOS} uploaded · Tip: 4-6 sharp project photos beat 12 mediocre ones
      </p>

      {!organizationId && (
        <p className="mt-2 text-xs text-amber-700">
          Portfolio upload requires a saved profile.
        </p>
      )}
    </div>
  );
}
