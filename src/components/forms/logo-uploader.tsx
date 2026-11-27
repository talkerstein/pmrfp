"use client";

/**
 * Single-image uploader for a company logo. Uploads directly to the existing
 * `logos` public bucket via the browser Supabase client, emits a hidden
 * `logoUrl` form field so the parent form's server action persists it.
 *
 * UX:
 *  - Drag-and-drop or click to pick. Single file. JPEG/PNG/WebP/SVG.
 *  - Replaces existing logo (orphaned objects cleaned up admin-side later).
 *  - Square preview area; uses object-contain so non-square logos aren't cropped.
 *  - 2 MB cap (logos > 2 MB are usually un-optimized PNGs; the cap pressures
 *    users to upload appropriately-sized files).
 */
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const TARGET = 250; // every stored raster logo is normalized to TARGET×TARGET

function loadImage(src: string, unreadable: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(unreadable));
    img.src = src;
  });
}

/**
 * Fit any raster logo onto a transparent 250×250 canvas (contain, centered) and
 * export WebP, so every stored logo renders uniformly in the directory grid.
 * SVGs are vector and pass through untouched.
 */
async function normalizeLogo(
  file: File,
  unreadable: string,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
  if (file.type === "image/svg+xml") {
    return { blob: file, ext: "svg", contentType: "image/svg+xml" };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url, unreadable);
    const canvas = document.createElement("canvas");
    canvas.width = TARGET;
    canvas.height = TARGET;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, ext: "png", contentType: file.type || "image/png" };
    const scale = Math.min(TARGET / img.width, TARGET / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    ctx.clearRect(0, 0, TARGET, TARGET);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, Math.round((TARGET - w) / 2), Math.round((TARGET - h) / 2), w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/webp", 0.92),
    );
    if (!blob) return { blob: file, ext: "png", contentType: file.type || "image/png" };
    return { blob, ext: "webp", contentType: "image/webp" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LogoUploader({
  organizationId,
  initialLogoUrl,
  label,
  helpText,
  nativeMedia = false,
}: {
  organizationId: string | null;
  initialLogoUrl?: string | null;
  label?: string;
  helpText?: string;
  nativeMedia?: boolean;
}) {
  const t = useT("dashClient").logo;
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const f = fileList[0];
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(fmt(t.badType, { name: f.name }));
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError(fmt(t.tooBig, { name: f.name }));
      return;
    }

    startTransition(async () => {
      try {
        if (nativeMedia) {
          const form = new FormData();
          form.set("file", f);
          form.set("kind", "logo");
          const response = await fetch("/api/company-media", { method: "POST", body: form });
          if (!response.ok) throw new Error(t.processFailed);
          setLogoUrl((await response.json() as { url: string }).url);
          setLogoChanged(true);
          return;
        }
        const { blob, ext, contentType } = await normalizeLogo(f, t.unreadable);
        const supabase = createBrowserClient();
        const id = crypto.randomUUID();
        const path = `${organizationId}/logo-${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("logos").upload(path, blob, {
          contentType,
          upsert: false,
          cacheControl: "31536000",
        });
        if (upErr) {
          setError(fmt(t.uploadFailed, { message: upErr.message }));
          return;
        }
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
        setLogoUrl(pub.publicUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.processFailed);
      }
    });
  }

  function removeLogo() {
    setLogoUrl(null);
    setLogoChanged(true);
    // Don't delete from storage yet — admin cleanup handles orphans. If the
    // user accidentally hits Remove, hitting Save without re-uploading just
    // clears the DB pointer.
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label ?? t.label}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{helpText ?? t.help}</p>

      {(!nativeMedia || logoChanged) && <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="relative size-32 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={t.alt}
              fill
              sizes="128px"
              className="object-contain p-2"
              unoptimized={nativeMedia || logoUrl.endsWith(".svg")}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {t.none}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={pick}
            disabled={isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors",
              "hover:border-teal-400 hover:bg-teal-50 hover:text-teal-ink",
              isPending && "cursor-wait opacity-60",
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t.uploading}
              </>
            ) : (
              <>
                <ImagePlus className="size-4" />
                {logoUrl ? t.replace : t.upload}
              </>
            )}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={removeLogo}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              {t.remove}
            </button>
          )}
          {!organizationId && (
            <p className="text-xs text-amber-700">{t.needsProfile}</p>
          )}
        </div>
      </div>
    </div>
  );
}
