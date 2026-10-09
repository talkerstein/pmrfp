"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { staffGuideImportAction, type GuideImportState } from "@/lib/forum/staff-guide-actions";

/** Admin-only (English): preview, then import the PMRFP Team staff guides. */
export function StaffGuideImport() {
  const [state, action, pending] = useActionState(staffGuideImportAction, {} as GuideImportState);
  const r = state.result;
  const previewed = r?.ready && r.dry;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="mode" value="dry" size="sm" variant="outline" disabled={pending}>
          Preview
        </Button>
        <Button type="submit" name="mode" value="run" size="sm" disabled={pending || !previewed || r.planned === 0}>
          Import staff guides
        </Button>
        {pending && <span className="text-sm text-muted-foreground">Working…</span>}
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {r && !r.ready && <p className="text-sm text-destructive">{r.reason}</p>}
      {r?.ready && (
        <div className="text-sm">
          <p>
            {r.dry ? "Would import" : "Imported"} <strong>{r.dry ? r.planned : r.created}</strong> of {r.total} guides
            {" "}({r.alreadyImported} already on the forum{r.failed ? `, ${r.failed} failed` : ""}).
            {r.reason && <span className="text-destructive"> {r.reason}</span>}
          </p>
          {r.dry && r.items.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {r.items.map((s) => (
                <li key={`${s.category}-${s.title}`}>
                  [{s.category}] {s.title}
                  {s.pinned && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900">pinned</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
