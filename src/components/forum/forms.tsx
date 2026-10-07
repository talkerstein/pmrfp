"use client";

import Script from "next/script";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, Lock, Pin, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import {
  acceptAnswerAction,
  createReplyAction,
  createThreadAction,
  modAction,
  rateThreadAction,
  reportAction,
  upvotePostAction,
  type ForumFormState,
  type ModOp,
} from "@/lib/forum/actions";
import { RATING_LABELS } from "@/lib/forum/rules";
import { cn } from "@/lib/utils";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Off-screen field bots fill in; people never see it. */
function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** Cloudflare Turnstile, rendered only when a site key is configured. */
function Turnstile({ show }: { show: boolean }) {
  if (!SITE_KEY || !show) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={SITE_KEY} />
    </>
  );
}

function ErrorLine({ state }: { state: ForumFormState }) {
  const t = useT("forumClient");
  if (state.error) return <p role="alert" className="text-sm text-destructive">{t.errors[state.error]}</p>;
  if (state.held) return <p role="status" className="text-sm text-teal-700">{t.form.held}</p>;
  return null;
}

export function ThreadForm({
  categories,
  initialCategory,
  firstPost,
  staffOption,
}: {
  categories: { slug: string; name: string }[];
  initialCategory?: string;
  firstPost: boolean;
  staffOption?: boolean;
}) {
  const t = useT("forumClient").form;
  const lang = useLang();
  const [state, action, pending] = useActionState(createThreadAction, {} as ForumFormState);
  const [type, setType] = useState<"question" | "discussion">("question");
  if (state.held) return <ErrorLine state={state} />;
  return (
    <form action={action} className="relative space-y-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="type" value={type} />
      <Honeypot />
      <div className="space-y-1.5">
        <Label htmlFor="forum-category">{t.forum}</Label>
        <select
          id="forum-category"
          name="category"
          defaultValue={initialCategory}
          required
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.type}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["question", "discussion"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              aria-pressed={type === k}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                type === k ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
              )}
            >
              <span className="font-semibold">{t[k]}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{k === "question" ? t.questionHint : t.discussionHint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="forum-title">{t.title}</Label>
        <Input id="forum-title" name="title" required minLength={8} maxLength={140} placeholder={t.titlePlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="forum-body">{t.body}</Label>
        <Textarea id="forum-body" name="body" required minLength={20} maxLength={10000} rows={9} placeholder={t.bodyPlaceholder} />
        <p className="text-xs text-muted-foreground">{t.help}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="forum-region">{t.region}</Label>
        <Input id="forum-region" name="region" maxLength={40} />
      </div>
      {staffOption && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="staff" value="1" defaultChecked /> {t.staff}
        </label>
      )}
      <Turnstile show={firstPost} />
      <ErrorLine state={state} />
      <Button type="submit" disabled={pending}>{pending ? t.posting : t.submit}</Button>
    </form>
  );
}

export function ReplyForm({ threadId, label, firstPost }: { threadId: string; label: string; firstPost: boolean }) {
  const t = useT("forumClient").form;
  const lang = useLang();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ForumFormState, fd: FormData) => {
    const res = await createReplyAction(prev, fd);
    if (res.ok) {
      ref.current?.reset();
      router.refresh();
    }
    return res;
  }, {} as ForumFormState);
  return (
    <form ref={ref} action={action} className="relative space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="threadId" value={threadId} />
      <Honeypot />
      <Label htmlFor="forum-reply">{label}</Label>
      <Textarea id="forum-reply" name="body" required minLength={2} maxLength={10000} rows={6} />
      <p className="text-xs text-muted-foreground">{t.help}</p>
      <Turnstile show={firstPost} />
      <ErrorLine state={state} />
      {state.ok && !state.held && <p role="status" className="text-sm text-teal-700">{t.posted}</p>}
      <Button type="submit" disabled={pending}>{pending ? t.replying : t.reply}</Button>
    </form>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ForumFormState["error"]>();
  const run = (fn: () => Promise<ForumFormState>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.error);
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, error, run };
}

export function RateThread({ threadId, current, canRate }: { threadId: string; current: number | null; canRate: boolean }) {
  const t = useT("forumClient");
  const { pending, error, run } = useRun();
  const [mine, setMine] = useState(current);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {RATING_LABELS.map((label, i) => {
          const score = i + 1;
          return (
            <button
              key={label}
              type="button"
              disabled={!canRate || pending}
              onClick={() => run(() => rateThreadAction(threadId, score), () => setMine(score))}
              aria-pressed={mine === score}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                mine === score ? "border-amber-500 bg-amber-500 text-white" : "border-border hover:bg-muted",
              )}
            >
              {t.ratings[label]}
            </button>
          );
        })}
      </div>
      {mine != null && <p className="mt-1.5 text-xs text-muted-foreground">{fmt(t.actions.yourRating, { label: t.ratings[RATING_LABELS[mine - 1]] })}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{t.errors[error]}</p>}
    </div>
  );
}

export function PostControls({
  postId,
  upvotes,
  voted,
  canVote,
  canAccept,
  accepted,
  canReport,
  isMod,
}: {
  postId: string;
  upvotes: number;
  voted: boolean;
  canVote: boolean;
  canAccept: boolean;
  accepted: boolean;
  canReport: boolean;
  isMod: boolean;
}) {
  const t = useT("forumClient");
  const { pending, error, run } = useRun();
  const [reported, setReported] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={!canVote || pending}
        onClick={() => run(() => upvotePostAction(postId))}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors disabled:cursor-default",
          voted ? "border-teal-600 bg-teal-50 text-teal-800" : "border-border hover:bg-muted",
        )}
        aria-pressed={voted}
      >
        <ThumbsUp className="size-3.5" /> {upvotes} <span className="sr-only">{voted ? t.actions.upvoted : t.actions.upvote}</span>
      </button>
      {canAccept && (
        <button type="button" disabled={pending} onClick={() => run(() => acceptAnswerAction(postId))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted">
          <CheckCircle2 className="size-3.5" /> {accepted ? t.actions.unaccept : t.actions.accept}
        </button>
      )}
      {canReport && (
        <button
          type="button"
          disabled={pending || reported}
          onClick={() => window.confirm(t.actions.reportConfirm) && run(() => reportAction("post", postId), () => setReported(true))}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          <Flag className="size-3.5" /> {reported ? t.actions.reported : t.actions.report}
        </button>
      )}
      {isMod && <ModButtons type="post" id={postId} ops={["hide"]} />}
      {error && <span role="alert" className="text-destructive">{t.errors[error]}</span>}
    </div>
  );
}

export function ThreadReport({ threadId }: { threadId: string }) {
  const t = useT("forumClient");
  const { pending, error, run } = useRun();
  const [reported, setReported] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={pending || reported}
        onClick={() => window.confirm(t.actions.reportConfirm) && run(() => reportAction("thread", threadId), () => setReported(true))}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        <Flag className="size-3.5" /> {reported ? t.actions.reported : t.actions.report}
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{t.errors[error]}</span>}
    </>
  );
}

const OP_ICON: Partial<Record<ModOp, typeof Lock>> = { lock: Lock, unlock: Lock, pin: Pin, unpin: Pin };

export function ModButtons({ type, id, ops }: { type: "thread" | "post"; id: string; ops: ModOp[] }) {
  const t = useT("forumClient");
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {ops.map((op) => {
        const Icon = OP_ICON[op];
        return (
          <button
            key={op}
            type="button"
            disabled={pending}
            onClick={() => run(() => modAction(type, id, op))}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-500/60 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50"
          >
            {Icon && <Icon className="size-3" />} {t.actions[op]}
          </button>
        );
      })}
      {error && <span role="alert" className="text-xs text-destructive">{t.errors[error]}</span>}
    </span>
  );
}
