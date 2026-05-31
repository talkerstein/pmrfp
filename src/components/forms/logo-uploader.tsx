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

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

export function LogoUploader({
  organizationId,
  initialLogoUrl,
  label = "Company logo",
  helpText = "Square works best (e.g. 512×512). JPEG, PNG, WebP, or SVG. Max 2 MB. Replaces the existing logo.",
}: {
  organizationId: string | null;
  initialLogoUrl?: string | null;
  label?: string;
  helpText?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null);
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
      setError("Save your basic profile first, then upload a logo.");
      return;
    }
    const f = fileList[0];
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError(`"${f.name}" — only JPEG, PNG, WebP, or SVG are allowed.`);
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError(`"${f.name}" is over 2 MB. Compress and try again.`);
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserClient();
      const ext = (f.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const id = crypto.randomUUID();
      const path = `${organizationId}/logo-${id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("logos").upload(path, f, {
        contentType: f.type,
        upsert: false,
        cacheControl: "31536000",
      });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
    });
  }

  function removeLogo() {
    setLogoUrl(null);
    // Don't delete from storage yet — admin cleanup handles orphans. If the
    // user accidentally hits Remove, hitting Save without re-uploading just
    // clears the DB pointer.
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{helpText}</p>

      <input type="hidden" name="logoUrl" value={logoUrl ?? ""} />
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
        <div className="relative size-32 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Company logo"
              fill
              sizes="128px"
              className="object-contain p-2"
              unoptimized={logoUrl.endsWith(".svg")}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No logo
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
                Uploading…
              </>
            ) : (
              <>
                <ImagePlus className="size-4" />
                {logoUrl ? "Replace logo" : "Upload logo"}
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
              Remove
            </button>
          )}
          {!organizationId && (
            <p className="text-xs text-amber-700">Logo upload requires a saved profile.</p>
          )}
        </div>
      </div>
    </div>
  );
}
