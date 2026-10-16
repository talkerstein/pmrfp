"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, BellOff, Camera, Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/provider";
import { fmt, plural } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { followRoomAction, setReplyEmailsAction, votePollAction, type ForumFormState } from "@/lib/forum/actions";
import { MAX_IMAGES_PER_POST, checkUpload } from "@/lib/forum/photos";
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from "@/lib/forum/polls";

interface Uploaded {
  path: string;
  w: number;
  h: number;
  preview: string;
}

/**
 * Photo picker for a thread or reply. Each photo goes to /api/forum/photos
 * (private until the post is approved; sharp strips EXIF/GPS server side).
 * The form carries only [{path, w, h}] in a hidden "images" field.
 */
export function PhotoUploader() {
  const t = useT("forumClient").photos;
  const [items, setItems] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let list = items;
    for (const file of Array.from(files)) {
      if (list.length >= MAX_IMAGES_PER_POST) break;
      const ok = checkUpload({ size: file.size, type: file.type }, list.length);
      if (!ok.ok) {
        setError(t.limit);
        continue;
      }
      const body = new FormData();
      body.append("file", file);
      body.append("count", String(list.length));
      try {
        const res = await fetch("/api/forum/photos", { method: "POST", body });
        const json = (await res.json()) as Partial<Uploaded> & { error?: string };
        if (!res.ok || !json.path || !json.preview) {
          setError(json.error ?? t.failed);
          continue;
        }
        list = [...list, { path: json.path, w: json.w ?? 1, h: json.h ?? 1, preview: json.preview }];
        setItems(list);
      } catch {
        setError(t.failed);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="images" value={JSON.stringify(items.map(({ path, w, h }) => ({ path, w, h })))} />
      {items.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {items.map((it, i) => (
            <li key={it.path} className="relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.preview} alt={fmt(t.alt, { n: i + 1 })} className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => setItems(items.filter((x) => x.path !== it.path))}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                aria-label={t.remove}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {items.length < MAX_IMAGES_PER_POST && (
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted", busy && "pointer-events-none opacity-60")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            {busy ? t.uploading : t.add}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
        )}
        <span className="text-xs text-muted-foreground">{t.limit}</span>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Optional poll on a new thread: a question and 2-6 options. */
export function PollFields() {
  const t = useT("forumClient").poll;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(MIN_POLL_OPTIONS);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
        <BarChart3 className="size-4" /> {t.add}
      </button>
    );
  }
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-semibold">{t.question}</legend>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">{t.remove}</button>
      </div>
      <Input name="pollQuestion" required minLength={3} maxLength={200} aria-label={t.question} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-1">
          <Label htmlFor={`poll-opt-${i}`} className="text-xs">{fmt(t.option, { n: i + 1 })}</Label>
          <Input id={`poll-opt-${i}`} name="pollOption" maxLength={80} required={i < MIN_POLL_OPTIONS} />
        </div>
      ))}
      {count < MAX_POLL_OPTIONS && (
        <button type="button" onClick={() => setCount(count + 1)} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          <Plus className="size-4" /> {t.addOption}
        </button>
      )}
      <p className="text-xs text-muted-foreground">{t.hint}</p>
    </fieldset>
  );
}

function useAction() {
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

export interface PollResultRow {
  id: string;
  label: string;
  votes: number;
  pct: number;
}

/**
 * A thread's poll. Before voting: the options. After voting (or once
 * closed): the results the server sent, which it only sends then.
 */
export function PollBlock({
  pollId,
  question,
  options,
  votedFor,
  results,
  total,
  canVote,
}: {
  pollId: string;
  question: string;
  options: { id: string; label: string }[];
  votedFor: string | null;
  results: PollResultRow[] | null;
  total: number;
  canVote: boolean;
}) {
  const t = useT("forumClient");
  const p = t.poll;
  const [choice, setChoice] = useState<string | null>(null);
  const { pending, error, run } = useAction();
  return (
    <section className="f-card" aria-label={question} style={{ marginTop: 14 }}>
      <h2 className="flex items-center gap-2 text-base font-bold text-[#1B1D3A]"><BarChart3 className="size-4 text-teal-700" aria-hidden /> {question}</h2>
      {results ? (
        <>
          <ul className="mt-3 space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium">{r.label}{votedFor === r.id && <Check className="size-3.5 text-teal-700" aria-label={p.youVoted} />}</span>
                  <span className="tabular-nums text-muted-foreground">{r.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#EEEFF6]" aria-hidden>
                  <div className="h-full rounded-full bg-[#282B59]" style={{ width: `${r.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{plural(total, p.votes)}</p>
        </>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice) run(() => votePollAction(pollId, choice));
          }}
        >
          {options.map((o) => (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", choice === o.id ? "border-[#282B59] bg-[#F5F5FA]" : "border-border")}>
              <input type="radio" name={`poll-${pollId}`} value={o.id} disabled={!canVote || pending} onChange={() => setChoice(o.id)} />
              {o.label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t.poll.hint}</p>
          {canVote && (
            <Button type="submit" size="sm" disabled={!choice || pending}>{pending ? p.voting : p.vote}</Button>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{t.errors[error]}</p>}
        </form>
      )}
    </section>
  );
}

/** Follow / unfollow a room. */
export function FollowButton({ slug, following, signedIn, signInHref }: { slug: string; following: boolean; signedIn: boolean; signInHref: string }) {
  const t = useT("forumClient");
  const { pending, error, run } = useAction();
  const [on, setOn] = useState(following);
  if (!signedIn) {
    return (
      <a href={signInHref} rel="nofollow" className="btn ghost">
        <Bell className="size-4" /> {t.follow.follow}
      </a>
    );
  }
  return (
    <>
      <button type="button" className="btn ghost" disabled={pending} aria-pressed={on} onClick={() => run(() => followRoomAction(slug, !on), () => setOn(!on))}>
        {on ? <Check className="size-4" /> : <Bell className="size-4" />} {on ? t.follow.following : t.follow.follow}
      </button>
      {error && <span role="alert" className="text-xs text-[#FCA5A5]">{t.errors[error]}</span>}
    </>
  );
}

/** For a thread's author: reply emails on/off (notification_preferences.forum_replies). */
export function ReplyEmailToggle({ on }: { on: boolean }) {
  const t = useT("forumClient");
  const { pending, error, run } = useAction();
  const [state, setState] = useState(on);
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {state ? <Bell className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />}
      {state ? t.emails.on : t.emails.off}
      <button type="button" disabled={pending} onClick={() => run(() => setReplyEmailsAction(!state), () => setState(!state))} className="font-semibold text-primary hover:underline">
        {state ? t.emails.turnOff : t.emails.turnOn}
      </button>
      {error && <span role="alert" className="text-destructive">{t.errors[error]}</span>}
    </p>
  );
}
