"use client";

import { useState } from "react";

export interface UploadSourceOption {
  key: string;
  label: string;
  fileUrl: string;
}

/**
 * Upload a source file an admin downloaded by hand (robots.txt blocks
 * automated access). The browser gzips it first so a 9 MB CSV fits the
 * request limit, then posts it to /api/admin/major-projects/upload.
 * "Preview" is a dry run: parsed counts and the plan, nothing saved.
 */
export function MajorProjectSourceUpload({ sources }: { sources: UploadSourceOption[] }) {
  const [source, setSource] = useState(sources[0]?.key ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const current = sources.find((s) => s.key === source);

  async function send(dry: boolean) {
    if (!file || !source) return;
    setBusy(true);
    setResult(null);
    try {
      const body =
        typeof CompressionStream === "function"
          ? await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()
          : await file.arrayBuffer();
      const res = await fetch(`/api/admin/major-projects/upload?source=${encodeURIComponent(source)}${dry ? "&dry=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
      const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<string, unknown>;
      setResult(
        json.error
          ? `Failed: ${String(json.error)}`
          : `${dry ? "Preview" : "Imported"}: ${json.parsed} projects parsed (${json.withValue} with a value)` +
              (json.inserts != null ? `; ${json.inserts} new, ${json.updates} changed, ${json.touched} unchanged, ${json.markedStale} no longer listed${json.staleGuardTripped ? " (stale marking skipped: the file looks incomplete)" : ""}` : "") +
              ".",
      );
    } catch (e) {
      setResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!sources.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mr-2 text-muted-foreground">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-border px-2 py-1">
            {sources.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <button type="button" disabled={!file || busy} onClick={() => send(true)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
          Preview
        </button>
        <button type="button" disabled={!file || busy} onClick={() => send(false)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Working…" : "Import"}
        </button>
      </div>
      {current && (
        <p className="text-xs text-muted-foreground">
          Download the file in your browser first:{" "}
          <a href={current.fileUrl} className="text-teal-ink underline" target="_blank" rel="noreferrer">{current.fileUrl}</a>
        </p>
      )}
      {result && <p className="rounded-md border border-border bg-secondary/40 p-2 text-sm" role="status">{result}</p>}
    </div>
  );
}
