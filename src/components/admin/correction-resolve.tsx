"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, type CorrectionStatus } from "@/lib/corrections/rules";

/** Admin: change one correction request's status and write what was done. English only. */
export function CorrectionResolve({ id, status, resolution }: { id: string; status: CorrectionStatus; resolution: string | null }) {
  const router = useRouter();
  const [s, setS] = useState<CorrectionStatus>(status);
  const [note, setNote] = useState(resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: s, resolution: note }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setMsg("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <select value={s} onChange={(e) => setS(e.target.value as CorrectionStatus)} className="rounded-md border border-border px-2 py-1 text-xs">
        {STATUSES.map((x) => (
          <option key={x} value={x}>{x.replace("_", " ")}</option>
        ))}
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What was checked and done (required to close)" className="block w-56 rounded-md border border-border px-2 py-1 text-xs" />
      <button type="button" disabled={busy} onClick={save} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
