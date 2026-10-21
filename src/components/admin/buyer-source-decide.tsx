"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERMISSION_METHODS, METHOD_LABEL, type PermissionMethod } from "@/lib/buyers/permissions";

/**
 * Admin: approve (registry status yes + method), reject, or keep notes on a
 * "list your tenders free" request. English only (admin screen).
 */
export function BuyerSourceDecide({
  id,
  status,
  method,
  buyerSlug,
  notes,
  refused,
}: {
  id: string;
  status: string;
  method: PermissionMethod;
  buyerSlug: string;
  notes: string | null;
  /** The code seed logs this buyer as "no": approving is refused. */
  refused: boolean;
}) {
  const router = useRouter();
  const [m, setM] = useState<PermissionMethod>(method);
  const [slug, setSlug] = useState(buyerSlug);
  const [note, setNote] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(action: "approve" | "reject" | "note") {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/buyer-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "approve" ? { action, id, method: m, buyerSlug: slug, notes: note } : { action, id, notes: note }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setMsg(action === "approve" ? "Approved: registry says yes" : action === "reject" ? "Rejected" : "Saved");
    router.refresh();
  }

  const decided = status !== "new";
  return (
    <div className="space-y-1">
      {!decided && (
        <>
          <label className="block text-xs">
            Buyer slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className="block w-56 rounded-md border border-border px-2 py-1 text-xs" />
          </label>
          <select value={m} onChange={(e) => setM(e.target.value as PermissionMethod)} className="rounded-md border border-border px-2 py-1 text-xs">
            {PERMISSION_METHODS.map((x) => (
              <option key={x} value={x}>{METHOD_LABEL[x]}</option>
            ))}
          </select>
        </>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes (what you checked: their site, who replied)" className="block w-56 rounded-md border border-border px-2 py-1 text-xs" />
      <div className="flex flex-wrap gap-1">
        {!decided && (
          <>
            <button type="button" disabled={busy || refused} onClick={() => send("approve")} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50" title={refused ? "This buyer declined: change the code seed first" : undefined}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => send("reject")} className="rounded-full border border-border px-3 py-1 text-xs font-semibold disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => send("note")} className="rounded-full border border-border px-3 py-1 text-xs disabled:opacity-50">
          {busy ? "Saving…" : "Save notes"}
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
