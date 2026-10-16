"use client";

import { useState } from "react";
import { UPLOAD_LIMIT_BYTES, buildPayload, type UploadKind } from "@/lib/tenders/canadabuys-upload";

async function gzip(text: string): Promise<ArrayBuffer> {
  if (typeof CompressionStream !== "function") return new TextEncoder().encode(text).buffer as ArrayBuffer;
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

interface Result {
  error?: string;
  rowsReceived?: number;
  matched?: number;
  inserted?: number;
  refreshed?: number;
  archived?: number;
  failed?: number;
}

/**
 * One CanadaBuys feed's upload: pick the files downloaded in a browser,
 * Preview (dry run, counts only) or Import. The browser keeps only usable
 * rows and columns, so the request stays under the 4.5 MB function limit.
 * Admin screen: English only.
 */
export function CanadabuysUpload({ kind, files, label }: { kind: UploadKind; files: string[]; label: string }) {
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function send(dry: boolean) {
    if (!picked.length) return;
    setBusy(true);
    setLog([`Reading ${picked.length} file(s)…`]);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const texts = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
      const payload = buildPayload(kind, texts, today);
      const body = await gzip(JSON.stringify(payload));
      if (body.byteLength > UPLOAD_LIMIT_BYTES) throw new Error(`Upload is ${(body.byteLength / 1e6).toFixed(1)} MB after compression (limit 4.4 MB)`);
      setLog((l) => [...l, `Sending ${payload.rows.length} usable rows (${(body.byteLength / 1e6).toFixed(2)} MB)…`]);
      const res = await fetch(`/api/admin/canadabuys/upload${dry ? "?dry=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Result;
      if (json.error) throw new Error(json.error);
      setLog((l) => [
        ...l,
        `${dry ? "Preview" : "Imported"}: ${json.matched ?? 0} listings matched, ${json.inserted ?? 0} new, ${json.refreshed ?? 0} refreshed, ${json.archived ?? 0} archived${json.failed ? `, ${json.failed} failed` : ""}${dry ? " (nothing saved)" : ""}.`,
      ]);
    } catch (e) {
      setLog((l) => [...l, `Failed: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-base font-semibold">{label}</h3>
      <p className="text-xs text-muted-foreground">
        Download {files.length > 1 ? "all of these" : "this file"} in your browser, then select {files.length > 1 ? "them" : "it"} below:{" "}
        {files.map((f, i) => (
          <span key={f}>
            {i > 0 && " · "}
            <a href={f} className="text-teal-ink underline" target="_blank" rel="noreferrer">
              {f.split("/").pop()}
            </a>
          </span>
        ))}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <input type="file" multiple accept=".csv,text/csv" onChange={(e) => setPicked(Array.from(e.target.files ?? []))} className="text-sm" />
        <button type="button" disabled={!picked.length || busy} onClick={() => send(true)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
          Preview
        </button>
        <button type="button" disabled={!picked.length || busy} onClick={() => send(false)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Working…" : "Import"}
        </button>
      </div>
      {log.length > 0 && (
        <div className="rounded-md border border-border bg-secondary/40 p-2 text-sm" role="status">
          {log.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}
