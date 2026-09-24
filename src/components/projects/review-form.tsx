"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { submitReviewAction, type ReviewFormState } from "@/lib/reviews/actions";
import { cn } from "@/lib/utils";

const RATING_WORD = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * The client's review form. Submitted by hand (not the form action prop) so
 * a validation error doesn't wipe a half-written review.
 */
export function ReviewForm({
  token,
  defaultName,
  tradeName,
}: {
  token: string;
  defaultName: string;
  tradeName: string;
}) {
  const [state, action, pending] = useActionState(submitReviewAction.bind(null, token), {} as ReviewFormState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state.done) {
    return (
      <div role="status" className="rounded-xl border border-teal-300 bg-teal-50 p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-teal-600" />
        <h2 className="mt-3 text-lg font-semibold">Thanks, that&apos;s sent.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We check every review before it goes up on {tradeName}&apos;s profile. You don&apos;t need to do
          anything else.
        </p>
      </div>
    );
  }
  if (state.expired) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        This link has already been used. If you didn&apos;t leave a review, email us at info@pmrfp.com.
      </div>
    );
  }

  const shown = hover || rating;
  const field =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base sm:text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-5"
    >
      {/* Honeypot: people never see it, bots fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <fieldset>
        <legend className="text-sm font-medium">How would you rate the work?</legend>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
              <input
                type="radio"
                name="rating"
                value={n}
                required
                checked={rating === n}
                onChange={() => setRating(n)}
                className="peer sr-only"
              />
              <Star
                aria-hidden
                className={cn(
                  "size-9 transition-colors peer-focus-visible:rounded peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500",
                  n <= shown ? "fill-amber-400 text-amber-400" : "text-slate-300",
                )}
              />
              <span className="sr-only">{n} out of 5, {RATING_WORD[n]}</span>
            </label>
          ))}
          <span className="ml-2 text-sm text-muted-foreground" aria-hidden>
            {RATING_WORD[shown]}
          </span>
        </div>
      </fieldset>

      <div>
        <label htmlFor="body" className="block text-sm font-medium">What was it like working with them?</label>
        <textarea
          id="body"
          name="body"
          required
          rows={5}
          maxLength={3000}
          className={field}
          placeholder="Were they on time and on budget? How did they handle problems? Would you hire them again?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">Your name</label>
          <input id="name" name="name" required maxLength={100} defaultValue={defaultName} className={field} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium">
            Your company <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input id="company" name="company" maxLength={120} className={field} autoComplete="organization" />
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="showBuilding" className="mt-0.5 size-5 accent-teal-700" />
          <span>
            OK to show our company name with the review
            <span className="block text-xs text-muted-foreground">
              Leave it unticked and we only show your first name and last initial.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="referenceOk" className="mt-0.5 size-5 accent-teal-700" />
          <span>
            OK for {tradeName} to list me as a reference
            <span className="block text-xs text-muted-foreground">
              They may share your name, company and email with people thinking of hiring them.
            </span>
          </span>
        </label>
      </div>

      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        Send review
      </button>
      <p className="text-xs text-muted-foreground">
        Good or bad, every review is checked by the PMRFP team before it goes live. Your email stays private.
      </p>
    </form>
  );
}
