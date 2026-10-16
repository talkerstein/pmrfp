"use client";

import { useState } from "react";

/** Target size of one piece of CSV text before gzip. */
const PIECE_CHARS = 3_000_000;

/**
 * Split a CSV text stream into pieces that each start with the header line
 * and end on a record boundary (quotes tracked, so a newline inside a quoted
 * field never splits a record). Pure, exported for tests.
 */
export async function* csvPieces(chunks: AsyncIterable<string>, pieceChars = PIECE_CHARS): AsyncGenerator<string> {
  let header: string | null = null;
  let buf = "";
  let quoted = false;
  let scanned = 0;
  let lastBreak = -1;
  for await (const chunk of chunks) {
    buf += chunk;
    for (; scanned < buf.length; scanned++) {
      const c = buf[scanned];
      if (c === '"') quoted = !quoted;
      else if (c === "\n" && !quoted) {
        if (header === null) {
          header = buf.slice(0, scanned + 1);
          buf = buf.slice(scanned + 1);
          scanned = -1;
          lastBreak = -1;
          continue;
        }
        lastBreak = scanned;
      }
    }
    if (header !== null && lastBreak >= 0 && buf.length >= pieceChars) {
      yield header + buf.slice(0, lastBreak + 1);
      // lastBreak was the last record boundary, so the rest holds none yet; the quote state at its end is unchanged.
      buf = buf.slice(lastBreak + 1);
      scanned = buf.length;
      lastBreak = -1;
    }
  }
  if (header !== null && buf.trim()) yield header + buf;
}

async function* fileText(file: File): AsyncGenerator<string> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
}

async function gzip(text: string): Promise<ArrayBuffer> {
  if (typeof CompressionStream !== "function") return new TextEncoder().encode(text).buffer as ArrayBuffer;
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

/**
 * Upload a CanadaBuys award-notice CSV downloaded by hand (robots.txt bars
 * bots from canadabuys.canada.ca). The file is split in the browser into
 * record-aligned ~3 MB pieces, each gzipped and posted in order. "Preview"
 * is a dry run: counts only, nothing saved.
 */
export function AwardHistoryUpload({ files }: { files: string[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState("");
  const [log, setLog] = useState<string[]>([]);

  async function send(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setLog([]);
    const total = { read: 0, kept: 0, written: 0 };
    let n = 0;
    try {
      for await (const piece of csvPieces(fileText(file))) {
        n++;
        const res = await fetch(`/api/admin/award-history/upload?source=ca-canadabuys-awards${dry ? "&dry=1" : ""}${since ? `&since=${encodeURIComponent(since)}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: await gzip(piece),
        });
        const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string; read?: number; kept?: number; written?: { upserted?: number } };
        if (json.error) throw new Error(`piece ${n}: ${json.error}`);
        total.read += json.read ?? 0;
        total.kept += json.kept ?? 0;
        total.written += json.written?.upserted ?? 0;
        setLog((l) => [...l, `Piece ${n}: ${json.read} rows read, ${json.kept} kept${json.written ? `, ${json.written.upserted} saved` : ""}`]);
      }
      setLog((l) => [...l, `${dry ? "Preview" : "Imported"}: ${total.read} rows read, ${total.kept} building-trade awards kept${dry ? "" : `, ${total.written} saved`}.`]);
    } catch (e) {
      setLog((l) => [...l, `Failed: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <label className="text-sm">
          <span className="mr-2 text-muted-foreground">Since</span>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="rounded-md border border-border px-2 py-1" />
        </label>
        <button type="button" disabled={!file || busy} onClick={() => send(true)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
          Preview
        </button>
        <button type="button" disabled={!file || busy} onClick={() => send(false)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Working…" : "Import"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Download a file in your browser first (canadabuys.canada.ca blocks bots in robots.txt, so PMRFP never fetches it):{" "}
        {files.map((f, i) => (
          <span key={f}>
            {i > 0 && " · "}
            <a href={f} className="text-teal-ink underline" target="_blank" rel="noreferrer">{f.split("/").pop()}</a>
          </span>
        ))}
        . Leave "Since" empty for the last five years.
      </p>
      {log.length > 0 && (
        <div className="rounded-md border border-border bg-secondary/40 p-2 text-sm" role="status">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
    </div>
  );
}
