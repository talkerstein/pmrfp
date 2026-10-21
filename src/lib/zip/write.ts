/**
 * A minimal ZIP writer (deflate, UTF-8 names, no ZIP64): enough for a
 * town's records export (CSV + HTML files, a few MB at most). Read back in
 * tests with lib/contract-history/zip.ts. Node only (zlib).
 */
import { deflateRawSync } from "node:zlib";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  /** Path inside the archive ("records/post.csv"). */
  name: string;
  data: string | Uint8Array;
}

/** DOS date and time (local fields from the UTC parts: archives carry no zone). */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** Safe archive paths: no leading slash, no "..", no backslashes or control characters. */
export function safeZipName(name: string): string {
  const clean = name
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
  return clean.slice(0, 200) || "file";
}

export function zip(files: readonly ZipFile[], when: Date = new Date()): Buffer {
  const enc = new TextEncoder();
  const { time, date } = dosTime(when);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const base = safeZipName(f.name);
    let name = base;
    for (let i = 2; seen.has(name); i++) name = base.replace(/(\.[^./]+)?$/, (ext) => `-${i}${ext}`);
    seen.add(name);
    const raw = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const deflated = deflateRawSync(raw);
    const stored = deflated.length >= raw.length;
    const body = stored ? Buffer.from(raw) : deflated;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(enc.encode(name));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
