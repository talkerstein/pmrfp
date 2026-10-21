"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin: approve or reject a public buyer's page claim. Approving can also
 * trust the claimant's email domain for that buyer, so the next clerk from
 * there is verified on the spot. English only (admin screen).
 */
export function BuyerClaimDecide({ id, domain, canTrust }: { id: string; domain: string | null; canTrust: boolean }) {
  const router = useRouter();
  const [trust, setTrust] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(action: "approve" | "reject") {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/buyer-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, trustDomain: action === "approve" && trust, notes: note || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setMsg(json.status === "join_requested" ? "Already managed: sent as a join request to them" : json.status === "verified" ? "Verified: the page is theirs" : "Rejected");
    router.refresh();
  }

  return (
    <div className="space-y-1">
      {canTrust && domain && (
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Also trust @{domain} for this buyer
        </label>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notes (what you checked)" className="block w-56 rounded-md border border-border px-2 py-1 text-xs" />
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={busy} onClick={() => send("approve")} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Verify"}
        </button>
        <button type="button" disabled={busy} onClick={() => send("reject")} className="rounded-full border border-border px-3 py-1 text-xs font-semibold disabled:opacity-50">
          Reject
        </button>
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
