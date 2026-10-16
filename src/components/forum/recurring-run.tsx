"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { recurringRunAction, type RecurringState } from "@/lib/forum/recurring-actions";

/** Admin-only (English): preview, then post today's recurring threads. */
export function RecurringRun() {
  const [state, action, pending] = useActionState(recurringRunAction, {} as RecurringState);
  const r = state.result;
  const previewed = r?.ready && r.dry;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="mode" value="dry" size="sm" variant="outline" disabled={pending}>
          Preview what&apos;s due today
        </Button>
        <Button type="submit" name="mode" value="run" size="sm" disabled={pending || !previewed || r.planned === 0}>
          Post them now
        </Button>
        {pending && <span className="text-sm text-muted-foreground">Working…</span>}
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {r && !r.ready && <p className="text-sm text-destructive">{r.reason}</p>}
      {r?.ready && (
        <div className="text-sm">
          <p>
            {r.dry ? "Would post" : "Posted"} <strong>{r.dry ? r.planned : r.created}</strong> threads for {r.today}
            {" "}({r.skippedExisting} already posted this period{r.failed ? `, ${r.failed} failed` : ""}).
            {Object.keys(r.byKind).length > 0 && (
              <span className="text-muted-foreground"> {Object.entries(r.byKind).map(([k, n]) => `${k}: ${n}`).join(" · ")}</span>
            )}
          </p>
          {r.dry && r.sample.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {r.sample.map((s) => (
                <li key={`${s.room}-${s.title}`}>
                  [{s.room} · {s.country}] {s.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
