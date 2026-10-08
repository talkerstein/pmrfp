"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { autoThreadImportAction, type AutoImportState } from "@/lib/forum/auto-actions";

/** Admin-only (English): preview, then import automatic PMRFP Board threads. */
export function AutoThreadImport() {
  const [state, action, pending] = useActionState(autoThreadImportAction, {} as AutoImportState);
  const r = state.result;
  const previewed = r?.ready && r.dry;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="mode" value="dry" size="sm" variant="outline" disabled={pending}>
          Preview (dry run)
        </Button>
        <Button type="submit" name="mode" value="run" size="sm" disabled={pending || !previewed || r.planned === 0}>
          Import last 90 days of tenders &amp; awards
        </Button>
        {pending && <span className="text-sm text-muted-foreground">Working…</span>}
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {r && !r.ready && <p className="text-sm text-destructive">{r.reason}</p>}
      {r?.ready && (
        <div className="text-sm">
          <p>
            {r.dry ? "Would create" : "Created"} <strong>{r.dry ? r.planned : r.created}</strong> threads
            {" "}({r.considered} records in window, {r.alreadyThreaded} already threaded{r.failed ? `, ${r.failed} failed` : ""}).
            {r.reason && <span className="text-destructive"> {r.reason}</span>}
          </p>
          {r.dry && r.sample.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {r.sample.map((s) => (
                <li key={`${s.title}-${s.createdAt}`}>
                  [{s.category}] {s.title} · {s.createdAt.slice(0, 10)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
