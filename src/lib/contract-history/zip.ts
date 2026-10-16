/**
 * Minimal ZIP reader for the USAspending download archives: reads the
 * central directory and inflates one entry (stored or deflate). No
 * ZIP64, no encryption — the archives USAspending generates need neither
 * below 4 GB. Node only (zlib).
 */
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function zipEntries(buf: Uint8Array): ZipEntry[] {
  // End of central directory: signature 0x06054b50 within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error("bad central directory");
    const method = u16(buf, p + 10);
    const compressedSize = u32(buf, p + 20);
    const size = u32(buf, p + 24);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const localOffset = u32(buf, p + 42);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function unzipEntry(buf: Uint8Array, e: ZipEntry): Uint8Array {
  const p = e.localOffset;
  if (u32(buf, p) !== 0x04034b50) throw new Error("bad local header");
  const start = p + 30 + u16(buf, p + 26) + u16(buf, p + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method === 8) return new Uint8Array(inflateRawSync(data, { maxOutputLength: 1_500_000_000 }));
  throw new Error(`zip method ${e.method} not supported`);
}
