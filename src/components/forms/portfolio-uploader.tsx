"use client";

/** Company portfolio photos use the site's media API on the VPS. */
import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, X, Loader2, AlertTriangle } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

const UPLOAD_CAP = 12;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const legacyMediaConfigured = Boolean(SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

interface PortfolioPhoto {
  url: string;
  path: string;
}

export function PortfolioUploader({
  organizationId,
  label,
  helpText,
  maxPhotos = 1,
  nativeMedia = false,
}: {
  organizationId: string | null;
  label?: string;
  helpText?: string;
  /** 1 on the free tier, 12 (the upload cap) on any paid tier. */
  maxPhotos?: number;
  nativeMedia?: boolean;
}) {
  const useCompanyMedia = nativeMedia || !legacyMediaConfigured;
  const t = useT("dashClient").portfolio;
  const limit = Math.min(maxPhotos, UPLOAD_CAP);
  const resolvedHelpText = helpText ?? (limit <= 1 ? t.helpFree : fmt(t.helpPaid, { limit }));
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
        if (useCompanyMedia) {
          const response = await fetch("/api/company-media", { cache: "no-store" });
          if (!response.ok) throw new Error(t.loadFailedGeneric);
          const items = await response.json() as PortfolioPhoto[];
          if (!cancelled) setPhotos(items);
          return;
        }
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
          setError(fmt(t.loadFailed, { message: listErr.message }));
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
      } catch {
        if (!cancelled) setError(t.loadFailedGeneric);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, useCompanyMedia, t.loadFailed, t.loadFailedGeneric]);

  function pick() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (!organizationId) {
      setError(t.saveFirst);
      return;
    }
    const remaining = limit - photos.length;
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) {
      setError(limit <= 1 ? t.freeLimit : fmt(t.max, { limit }));
      return;
    }
    for (const f of files) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError(fmt(t.badType, { name: f.name }));
        return;
      }
      if (f.size > MAX_SIZE_BYTES) {
        setError(fmt(t.tooBig, { name: f.name }));
        return;
      }
    }

    startUpload(async () => {
      if (useCompanyMedia) {
        for (const file of files) {
          try {
            const form = new FormData();
            form.set("file", file);
            form.set("kind", "portfolio");
            const response = await fetch("/api/company-media", { method: "POST", body: form });
            if (response.status === 409) {
              setError(limit <= 1 ? t.freeLimit : fmt(t.max, { limit }));
              break;
            }
            if (!response.ok) throw new Error(t.loadFailedGeneric);
            const photo = await response.json() as PortfolioPhoto;
            setPhotos(previous => [...previous, photo]);
          } catch {
            setError(t.loadFailedGeneric);
            break;
          }
        }
        return;
      }
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
          setError(fmt(t.uploadFailed, { name: f.name, message: upErr.message }));
          break;
        }
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, path });
      }
      if (uploaded.length) setPhotos((prev) => [...prev, ...uploaded]);
    });
  }

  async function remove(idx: number) {
    if (useCompanyMedia) {
      const photo = photos[idx];
      if (!photo) return;
      try {
        const response = await fetch(`/api/company-media/${encodeURIComponent(photo.path)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(t.loadFailedGeneric);
        setPhotos(previous => previous.filter(item => item.path !== photo.path));
      } catch {
        setError(t.loadFailedGeneric);
      }
      return;
    }
    const photo = photos[idx];
    if (!photo) return;
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    try {
      const supabase = createBrowserClient();
      await supabase.storage.from("logos").remove([photo.path]);
    } catch {
      // Best-effort; orphans are cleaned up admin-side later.
    }
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label ?? t.label}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{resolvedHelpText}</p>

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
                unoptimized={useCompanyMedia}
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={t.remove}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-black/85 focus:opacity-100 group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {photos.length < limit && (
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
                  {t.uploading}
                </>
              ) : (
                <>
                  <ImagePlus className="size-6" />
                  {photos.length === 0 ? t.add : t.addMore}
                </>
              )}
            </button>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {fmt(t.count, { n: photos.length, limit })}
        {limit <= 1 ? t.upgradeTip : t.tip}
      </p>

      {!organizationId && (
        <p className="mt-2 text-xs text-amber-700">{t.needsProfile}</p>
      )}
    </div>
  );
}
