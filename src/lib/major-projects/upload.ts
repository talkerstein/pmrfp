/**
 * Admin file uploads for sources whose host disallows automated access in
 * robots.txt (Infrastructure Canada's /alt-format/). An admin downloads the
 * file in a browser and uploads it at /admin/major-projects; the browser
 * gzips it first (the 9 MB CSV is ~1.5 MB gzipped, under the 4.5 MB request
 * limit). Pure helpers here; the route is api/admin/major-projects/upload.
 */
import { gunzipSync } from "node:zlib";

/** Compressed request body limit (Vercel functions accept 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4_400_000;
/** Decompressed file limit. */
export const MAX_FILE_BYTES = 40_000_000;

/** UTF-8 when the bytes are valid UTF-8, else Windows-1252 (Infrastructure Canada ships Latin-1). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The uploaded file's text: gunzipped when the body is gzip (magic bytes 1f 8b). */
export function uploadText(body: Uint8Array): string {
  const gz = body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
  const raw = gz ? new Uint8Array(gunzipSync(body, { maxOutputLength: MAX_FILE_BYTES })) : body;
  return decodeText(raw);
}

/** Does the first line of the CSV carry the expected column? */
export function hasHeader(text: string, column: string): boolean {
  const first = text.slice(0, 4000).split(/\r?\n/)[0] ?? "";
  return first.split(",").some((h) => h.replace(/^"|"$/g, "").trim() === column);
}
