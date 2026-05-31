"use client";

/**
 * "Close this RFP" PM action — surfaces on /pm-dashboard/rfps/[id]/interests.
 *
 * Two outcomes:
 *  - Awarded: the PM picked a winner. Public RFP detail shows "Awarded"; if
 *    the project came via /refer-a-project, the referrer becomes finder's-fee
 *    eligible.
 *  - Closed: cancelled / no award. Public detail shows "Closed — not awarded".
 *
 * No fancy modal — inline confirm pattern with a 2-button outcome picker.
 * Keeps the surface small + reversible-looking (admins can re-open via SQL
 * if a mistake happens; the UI doesn't currently let the PM un-close, by
 * design — closing is meant to be the final state).
 */
import { useActionState, useState } from "react";
import { closeRfpAction } from "@/lib/dashboard/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Check, X, Loader2 } from "lucide-react";

export function CloseRfpButton({
  rfpId,
  alreadyClosed,
}: {
  rfpId: string;
  alreadyClosed: boolean;
}) {
  const [state, action, pending] = useActionState(closeRfpAction, {} as ActionState);
  const [confirming, setConfirming] = useState<null | "awarded" | "closed">(null);

  if (alreadyClosed || state.success) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
        <Check className="mb-1 size-4" />
        {state.success ?? "This RFP is closed."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Close this RFP</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            When you&rsquo;ve picked a vendor (or decided not to proceed), close the RFP so
            it stops appearing as an open opportunity to trades.
          </p>
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
      )}

      {confirming ? (
        <form action={action} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="rfpId" value={rfpId} />
          <input type="hidden" name="outcome" value={confirming} />
          <p className="rounded-md border border-teal-300/60 bg-teal-100/40 px-3 py-2 text-xs text-foreground">
            {confirming === "awarded"
              ? "Confirm: you've awarded this RFP to a vendor (on-platform or off)."
              : "Confirm: close this RFP without awarding it."}
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Closing…
                </>
              ) : (
                "Yes, close it"
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={pending}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirming("awarded")}
            className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success hover:bg-success/15"
          >
            <Check className="size-3.5" /> Mark as awarded
          </button>
          <button
            type="button"
            onClick={() => setConfirming("closed")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" /> Close without award
          </button>
        </div>
      )}
    </div>
  );
}
