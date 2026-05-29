"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SaveButton({
  rfpId,
  initialSaved = false,
}: {
  rfpId: string;
  initialSaved?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !saved;
    try {
      const res = await fetch("/api/save-rfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfpId, action: next ? "save" : "unsave" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast.error("Trade Pro membership required to save opportunities.");
        return;
      }
      if (!res.ok) throw new Error();
      if (json.demo) {
        toast.info("Demo mode — connect Supabase to save opportunities.");
      }
      setSaved(next);
      if (next && !json.demo) toast.success("Saved to your dashboard.");
    } catch {
      toast.error("Could not update. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={toggle} disabled={busy}>
      {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
