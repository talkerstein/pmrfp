import sharp from "sharp";

/**
 * Every project photo goes through here before it's stored: turned upright
 * from its EXIF orientation, shrunk to fit 1920px, re-encoded as JPEG. sharp
 * writes no metadata unless asked (we never call withMetadata/keepExif), so
 * GPS coordinates, camera serials and timestamps are gone from the output.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 1920;
const QUALITY = 82;

export class UnreadableImageError extends Error {}

export async function processPhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (err) {
    throw new UnreadableImageError(err instanceof Error ? err.message : String(err));
  }
}
