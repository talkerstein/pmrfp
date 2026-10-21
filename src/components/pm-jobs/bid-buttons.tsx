"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Share2, Star, X } from "lucide-react";
import { declineAction, pickAction, shareContactAction, shortlistAction, type BidActionState } from "@/lib/pm-jobs/bid-actions";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import type { ClientMessages } from "@/i18n/dictionaries";

/**
 * One response's actions on the poster's job page: shortlist, decline (with
 * an optional note), pick (confirm first), share my contact (confirm first).
 */
export function BidButtons({
  rfpId,
  interestId,
  company,
  shortlisted,
  canPick,
  contactShared,
}: {
  rfpId: string;
  interestId: string;
  company: string;
  shortlisted: boolean;
  /** The job can still be awarded. */
  canPick: boolean;
  contactShared: boolean;
}) {
  const t = useT("pmJobsClient").bids;
  const [mode, setMode] = useState<null | "decline" | "pick" | "share">(null);
  const [shortState, shortAct, shortBusy] = useActionState(shortlistAction, {} as BidActionState);
  const [declState, declAct, declBusy] = useActionState(declineAction, {} as BidActionState);
  const [pickState, pickAct, pickBusy] = useActionState(pickAction, {} as BidActionState);
  const [shareState, shareAct, shareBusy] = useActionState(shareContactAction, {} as BidActionState);

  // One toast per answer; a finished decline / pick / share closes its form.
  useAnswer(shortState, t);
  useAnswer(declState, t, () => setMode(null));
  useAnswer(pickState, t, () => setMode(null));
  useAnswer(shareState, t, () => setMode(null));

  const hidden = (
    <>
      <input type="hidden" name="rfpId" value={rfpId} />
      <input type="hidden" name="interestId" value={interestId} />
    </>
  );
  const busy = shortBusy || declBusy || pickBusy || shareBusy;
  const spin = <Loader2 className="size-3.5 animate-spin" />;
  const small = "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60";

  if (mode === "decline") {
    return (
      <form action={declAct} className="flex flex-col gap-2">
        {hidden}
        <label className="text-xs font-medium">
          {t.declineNote}
          <textarea name="note" rows={2} maxLength={1000} placeholder={t.declinePlaceholder} className="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm" />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={`${small} border-red-200 bg-red-50 text-red-800 hover:bg-red-100`}>
            {declBusy ? spin : <X className="size-3.5" />} {t.declineConfirm}
          </button>
          <button type="button" onClick={() => setMode(null)} className={`${small} border-border text-muted-foreground`}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }

  if (mode === "pick" || mode === "share") {
    const pick = mode === "pick";
    return (
      <form action={pick ? pickAct : shareAct} className="flex flex-col gap-2">
        {hidden}
        <p className="rounded-md border border-teal-300/60 bg-teal-100/40 px-3 py-2 text-xs text-foreground">
          {fmt(pick ? t.pickConfirm : t.shareConfirm, { company })}
        </p>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={`${small} border-transparent bg-indigo text-white hover:bg-indigo-700`}>
            {(pick ? pickBusy : shareBusy) ? spin : <Check className="size-3.5" />} {pick ? t.pickYes : t.shareYes}
          </button>
          <button type="button" onClick={() => setMode(null)} className={`${small} border-border text-muted-foreground`}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canPick && (
        <button type="button" disabled={busy} onClick={() => setMode("pick")} className={`${small} border-success/40 bg-success/10 text-success hover:bg-success/15`}>
          <Check className="size-3.5" /> {t.pick}
        </button>
      )}
      <form action={shortAct}>
        {hidden}
        <button type="submit" disabled={busy} className={`${small} border-border bg-card text-foreground hover:bg-secondary`}>
          {shortBusy ? spin : <Star className={shortlisted ? "size-3.5 fill-current" : "size-3.5"} />} {shortlisted ? t.unshortlist : t.shortlist}
        </button>
      </form>
      {!contactShared && (
        <button type="button" disabled={busy} onClick={() => setMode("share")} className={`${small} border-border bg-card text-foreground hover:bg-secondary`}>
          <Share2 className="size-3.5" /> {t.share}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => setMode("decline")} className={`${small} border-border bg-card text-muted-foreground hover:text-foreground`}>
        <X className="size-3.5" /> {t.decline}
      </button>
    </div>
  );
}

function useAnswer(state: BidActionState, t: ClientMessages["pmJobsClient"]["bids"], after?: () => void) {
  useEffect(() => {
    if (state.error) toast.error(t.errors[state.error] ?? t.errors.failed);
    else if (state.done) toast.success(t.done[state.done]);
    if (state.error || state.done) after?.();
    // Only when the answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
