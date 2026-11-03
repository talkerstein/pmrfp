import sharp from "sharp";
import { SITE } from "@/lib/site";

/**
 * Loads a company's logo for its share card. The image renderer can't read
 * WebP, and most logos are WebP, so every logo becomes a PNG data URI here.
 * Any failure returns null and the card shows initials instead: a bad logo
 * must never take the share image down.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 3000;
const LOGO_BOX = { width: 460, height: 216 };
const LOGOS_BUCKET_PATH = "/storage/v1/object/public/logos/";

export interface OgLogo {
  src: string;
  width: number;
  height: number;
}

/**
 * The only places a logo may be fetched from: our own /logos folder, or the
 * Supabase logos bucket (the same rule the dashboard applies on save).
 */
export function resolveLogoUrl(
  logoUrl: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!logoUrl) return null;
  let url: URL;
  try {
    url = new URL(logoUrl, SITE.url);
  } catch {
    return null;
  }
  if (url.origin === new URL(SITE.url).origin) return url.pathname.startsWith("/logos/") ? url.href : null;
  if (url.protocol !== "https:" || !supabaseUrl) return null;
  try {
    return url.host === new URL(supabaseUrl).host && url.pathname.startsWith(LOGOS_BUCKET_PATH) ? url.href : null;
  } catch {
    return null;
  }
}

/** Up to two initials, skipping words that don't start with a letter or number ("A & B" is "AB"). */
export function companyInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return words.slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase() || "?";
}

export async function loadOgLogo(logoUrl: string | null | undefined): Promise<OgLogo | null> {
  const url = resolveLogoUrl(logoUrl);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_BYTES) return null;

    const toPng = (img: sharp.Sharp) =>
      img.resize({ ...LOGO_BOX, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    const open = () => sharp(input, { limitInputPixels: 50_000_000 });
    // Trim so a logo saved with wide margins still fills its tile. Trimming
    // throws on a one-colour image, which then just goes through untrimmed.
    const { data, info } = await toPng(open().trim()).catch(() => toPng(open()));
    return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
