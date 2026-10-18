"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

/**
 * Save / unsave an RFP. Free for any signed-in trade or supplier account
 * (Trade Pro not required). Pass the listing's id when the page has it, or
 * its slug (free viewers only see the public teaser, which has no id).
 */
export function SaveButton({
  rfpId,
  rfpSlug,
  initialSaved = false,
}: {
  rfpId?: string;
  rfpSlug?: string;
  initialSaved?: boolean;
}) {
  const t = useT("boardClient").save;
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !saved;
    try {
      const res = await fetch("/api/save-rfp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(rfpId ? { rfpId } : { rfpSlug }), action: next ? "save" : "unsave" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast.error(t.proRequired);
        return;
      }
      if (!res.ok) throw new Error();
      if (json.demo) {
        toast.info(t.demo);
      }
      setSaved(next);
      if (next && !json.demo) toast.success(t.success);
    } catch {
      toast.error(t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={toggle} disabled={busy}>
      {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      {saved ? t.saved : t.save}
    </Button>
  );
}
