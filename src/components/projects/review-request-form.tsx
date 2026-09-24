"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { requestReviewAction, type InviteState } from "@/lib/projects/actions";

/** "Ask for a review": client name + email → one-time review link by email. */
export function ReviewRequestForm({ caseStudyId }: { caseStudyId: string }) {
  const [state, action, pending] = useActionState(requestReviewAction, {} as InviteState);
  const formRef = useRef<HTMLFormElement>(null);

  // Submitted by hand (not via the form's action prop) so a typo'd email
  // stays in the field on error; cleared only after a successful send.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-2"
    >
      <input type="hidden" name="caseStudyId" value={caseStudyId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor={`cn-${caseStudyId}`}>Client name</label>
        <input id={`cn-${caseStudyId}`} name="clientName" required maxLength={100} placeholder="Client name" className={field} autoComplete="off" />
        <label className="sr-only" htmlFor={`ce-${caseStudyId}`}>Client email</label>
        <input id={`ce-${caseStudyId}`} name="clientEmail" type="email" required maxLength={200} placeholder="client@company.com" className={field} autoComplete="off" />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Ask for a review
        </button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-teal-ink">{state.success}</p>}
    </form>
  );
}
