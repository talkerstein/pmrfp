"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  answerQuestionAction,
  askQuestionAction,
  inviteByEmailAction,
  issueAddendumAction,
  sendTradeInvitesAction,
  setQuestionDeadlineAction,
  type TownActionState,
} from "@/lib/town-jobs/actions";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import type { ClientMessages } from "@/i18n/dictionaries";

/**
 * A town's job, in the browser: the forms on /buyer-dashboard/jobs/[id]
 * (answer, addendum, question deadline, invites) and the private "Ask a
 * question" box on the listing. Each posts to a server action
 * (lib/town-jobs/actions) and shows its answer in the page's language.
 */

type T = ClientMessages["townJobsClient"];

function errorText(t: T, code: string | undefined, own: Record<string, string> = {}, vars: Record<string, string | number> = {}): string | null {
  if (!code) return null;
  return fmt(own[code] ?? t.errors[code] ?? t.errors.failed, vars);
}

/** A form's answer as a toast once, and a reset of the form after a success. */
function useOutcome(state: TownActionState, message: (s: TownActionState) => string | null, error: (s: TownActionState) => string | null, form?: React.RefObject<HTMLFormElement | null>) {
  const seen = useRef<TownActionState | null>(null);
  useEffect(() => {
    if (seen.current === state || (!state.done && !state.error)) return;
    seen.current = state;
    if (state.error) {
      const e = error(state);
      if (e) toast.error(e);
      return;
    }
    const m = message(state);
    if (m) toast.success(m);
    form?.current?.reset();
  }, [state, message, error, form]);
}

const Hidden = ({ rfpId }: { rfpId: string }) => {
  const lang = useLang();
  return (
    <>
      <input type="hidden" name="rfpId" value={rfpId} />
      <input type="hidden" name="lang" value={lang} />
    </>
  );
};

const spin = <Loader2 className="size-3.5 animate-spin" />;

/** The town answers one question (once). It may reword the question before it's published. */
export function AnswerForm({ rfpId, questionId, question }: { rfpId: string; questionId: string; question: string }) {
  const t = useT("townJobsClient");
  const [state, action, busy] = useActionState(answerQuestionAction, {} as TownActionState);
  useOutcome(
    state,
    (s) => fmt(s.emailsOn ? t.answer.done : t.answer.doneOff, { n: s.n ?? 0, e: s.wouldSend ?? 0 }),
    (s) => errorText(t, s.error, t.answer.errors),
  );
  if (state.done) return <p className="text-sm text-teal-800">{fmt(state.emailsOn ? t.answer.done : t.answer.doneOff, { n: state.n ?? 0, e: state.wouldSend ?? 0 })}</p>;
  return (
    <form action={action} className="mt-3 space-y-2">
      <Hidden rfpId={rfpId} />
      <input type="hidden" name="questionId" value={questionId} />
      <label className="block text-xs font-medium">
        {t.answer.publicLabel}
        <Textarea name="publicQuestion" rows={2} defaultValue={question} maxLength={2000} className="mt-1" />
        <span className="mt-1 block font-normal text-muted-foreground">{t.answer.publicHint}</span>
      </label>
      <label className="block text-xs font-medium">
        {t.answer.answerLabel}
        <Textarea name="answer" rows={3} required minLength={2} maxLength={4000} className="mt-1" />
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? spin : <Send className="size-3.5" />} {busy ? t.answer.sending : t.answer.submit}
      </Button>
    </form>
  );
}

/** Issue the next addendum (text, an optional link, an optional new closing date). */
export function AddendumForm({ rfpId, minDate, live }: { rfpId: string; minDate: string; live: boolean }) {
  const t = useT("townJobsClient");
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, busy] = useActionState(issueAddendumAction, {} as TownActionState);
  useOutcome(
    state,
    (s) => fmt(s.emailsOn ? t.addendum.done : t.addendum.doneOff, { num: s.num ?? "", n: s.n ?? 0, e: s.wouldSend ?? 0 }),
    (s) => errorText(t, s.error, t.addendum.errors),
    ref,
  );
  return (
    <form ref={ref} action={action} className="space-y-3">
      <Hidden rfpId={rfpId} />
      <label className="block text-sm font-medium">
        {t.addendum.body}
        <Textarea name="body" rows={3} required minLength={5} maxLength={4000} placeholder={t.addendum.bodyPlaceholder} className="mt-1" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          {t.addendum.url}
          <Input name="officialUrl" type="url" inputMode="url" placeholder="https://" className="mt-1" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{t.addendum.urlHint}</span>
        </label>
        {live && (
          <label className="block text-sm font-medium">
            {t.addendum.newDeadline}
            <Input name="newDeadline" type="date" min={minDate} className="mt-1" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{t.addendum.newDeadlineHint}</span>
          </label>
        )}
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? spin : null} {busy ? t.addendum.sending : t.addendum.submit}
      </Button>
    </form>
  );
}

/** The last day to ask questions (empty: until closing). */
export function QuestionDeadlineForm({ rfpId, value, min, max }: { rfpId: string; value: string | null; min: string; max: string | null }) {
  const t = useT("townJobsClient");
  const [state, action, busy] = useActionState(setQuestionDeadlineAction, {} as TownActionState);
  useOutcome(state, () => t.deadline.done, (s) => errorText(t, s.error, t.deadline.errors));
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Hidden rfpId={rfpId} />
      <label className="block text-sm font-medium">
        {t.deadline.label}
        <Input name="questionDeadline" type="date" defaultValue={value ?? ""} min={min} max={max ?? undefined} className="mt-1 w-44" />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? spin : null} {busy ? t.deadline.saving : t.deadline.save}
      </Button>
    </form>
  );
}

/** "Invite N matching trades" (the list is shown above it by the page). */
export function InviteTradesButton({ rfpId, count }: { rfpId: string; count: number }) {
  const t = useT("townJobsClient");
  const [state, action, busy] = useActionState(sendTradeInvitesAction, {} as TownActionState);
  const message = (s: TownActionState) =>
    s.done === "off" ? fmt(t.invites.off, { n: s.wouldSend ?? 0 }) : `${fmt(t.invites.sent, { n: s.n ?? 0 })}${s.overLimit ? ` ${fmt(t.invites.overLimit, { n: s.overLimit })}` : ""}`;
  useOutcome(state, message, (s) => errorText(t, s.error, t.invites.errors, { n: s.wouldSend ?? 0 }));
  return (
    <form action={action} className="space-y-2">
      <Hidden rfpId={rfpId} />
      <Button type="submit" disabled={busy || count === 0}>
        {busy ? spin : <Send className="size-4" />} {busy ? t.invites.sending : fmt(t.invites.send, { n: count })}
      </Button>
      {state.done && <p className="text-sm text-muted-foreground" data-invites={state.done}>{message(state)}</p>}
      {state.error && <p className="text-sm text-amber-800">{errorText(t, state.error, t.invites.errors, { n: state.wouldSend ?? 0 })}</p>}
    </form>
  );
}

/** "Invite a contractor by email": a free sign-up link that comes back to the job. */
export function InviteByEmailForm({ rfpId }: { rfpId: string }) {
  const t = useT("townJobsClient");
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, busy] = useActionState(inviteByEmailAction, {} as TownActionState);
  const message = (s: TownActionState) => (s.done === "off" ? t.invites.emailOff : t.invites.emailSent);
  useOutcome(state, message, (s) => errorText(t, s.error, t.invites.emailErrors), ref);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <Hidden rfpId={rfpId} />
      <p className="text-sm font-medium">{t.invites.emailTitle}</p>
      <p className="text-xs text-muted-foreground">{t.invites.emailBody}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="email" type="email" required placeholder={t.invites.emailPlaceholder} aria-label={t.invites.emailLabel} autoComplete="off" />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? spin : null} {t.invites.emailSend}
        </Button>
      </div>
      {state.done && <p className="text-sm text-muted-foreground">{message(state)}</p>}
    </form>
  );
}

/** The private "Ask a question" box on a town's listing. */
export function AskQuestionForm({ rfpId }: { rfpId: string }) {
  const t = useT("townJobsClient");
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, busy] = useActionState(askQuestionAction, {} as TownActionState);
  useOutcome(state, () => t.ask.done, (s) => errorText(t, s.error, t.ask.errors), ref);
  if (state.done) return <p className="vp-p" data-asked="1">{t.ask.done}</p>;
  return (
    <form ref={ref} action={action} className="space-y-2" data-form="ask">
      <Hidden rfpId={rfpId} />
      <label className="block text-sm font-medium">
        {t.ask.label}
        <Textarea name="question" rows={3} required minLength={5} maxLength={2000} placeholder={t.ask.placeholder} className="mt-1" />
      </label>
      <p className="text-xs text-muted-foreground">{t.ask.hint}</p>
      {state.error && <p className="text-sm text-red-700">{errorText(t, state.error, t.ask.errors)}</p>}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? spin : <Send className="size-3.5" />} {busy ? t.ask.sending : t.ask.submit}
      </Button>
    </form>
  );
}
