"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Link2, Loader2, Lock } from "lucide-react";
import {
  createShareLinkAction,
  revokeShareLinkAction,
  setVisibilityAction,
  type ControlState,
} from "@/lib/projects/actions";
import { VISIBILITIES, type Visibility } from "@/lib/projects/visibility";
import { useLang, useT } from "@/i18n/provider";
import { useProjectMessage } from "./server-messages";
import { localizePath } from "@/i18n/config";
import { formatDate, plural } from "@/i18n/format";

/**
 * Per-project controls on the dashboard: who can see it, and the private
 * links a company hands out for bids. Both post to server actions that
 * re-check ownership and the plan (lib/projects/manage).
 */

const ICON: Record<Visibility, typeof Eye> = { public: Eye, unlisted: Link2, private: Lock };

export function VisibilityControl({ id, value, paid }: { id: string; value: Visibility; paid: boolean }) {
  const t = useT("portfolioClient").visibility;
  const say = useProjectMessage();
  const [state, action, pending] = useActionState(setVisibilityAction, {} as ControlState);
  const [picked, setPicked] = useState<Visibility>(value);
  const [shown, setShown] = useState(false);
  // A refused change (plan, not yours) snaps back to what's saved.
  const current = state.error && !pending ? value : picked;

  const hint = { public: t.publicHint, unlisted: t.unlistedHint, private: t.privateHint }[current];
  const Icon = ICON[current];

  return (
    <div>
      <label htmlFor={`vis-${id}`} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" /> {t.label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <select
          id={`vis-${id}`}
          value={current}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value as Visibility;
            setPicked(v);
            setShown(true);
            const fd = new FormData();
            fd.set("id", id);
            fd.set("visibility", v);
            startTransition(() => action(fd));
          }}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v} disabled={v === "private" && !paid && value !== "private"}>
              {t[v]}
              {v === "private" && !paid ? ` (${t.proOnly})` : ""}
            </option>
          ))}
        </select>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t.saving} />}
        {!pending && shown && state.ok && (
          <span role="status" className="flex items-center gap-1 text-xs text-teal-ink">
            <Check className="size-3.5" /> {t.saved}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {state.error && <p role="alert" className="mt-1 text-xs text-red-700">{say(state.error)}</p>}
    </div>
  );
}

export interface ShareLinkView {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
}

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt(label, text);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:border-teal-400 hover:text-teal-ink"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? done : label}
    </button>
  );
}

export function ShareLinks({
  caseStudyId,
  links,
  paid,
  published,
  siteBase,
}: {
  caseStudyId: string;
  links: ShareLinkView[];
  paid: boolean;
  published: boolean;
  siteBase: string;
}) {
  const t = useT("portfolioClient").share;
  const say = useProjectMessage();
  const lang = useLang();
  const [createState, create, creating] = useActionState(createShareLinkAction, {} as ControlState);
  const [, revoke, revoking] = useActionState(revokeShareLinkAction, {} as ControlState);
  const formRef = useRef<HTMLFormElement>(null);
  const url = (token: string) => `${siteBase}/shared/${token}`;

  useEffect(() => {
    if (createState.token) formRef.current?.reset();
  }, [createState]);

  if (!paid) {
    return (
      <p className="text-xs text-muted-foreground">
        <EyeOff className="mr-1 inline size-3.5" />
        {t.upsell}{" "}
        <a href={localizePath("/pricing", lang)} className="font-medium text-teal-ink hover:underline">
          {t.upsellLink}
        </a>
      </p>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">{t.title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
      {!published ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.unpublished}</p>
      ) : (
        <>
          {links.length > 0 && (
            <ul className="mt-3 space-y-2">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{l.label || url(l.token).replace(/^https?:\/\//, "")}</span>
                    <span className="text-muted-foreground">
                      {plural(l.viewCount, t.views)}
                      {l.lastViewedAt ? ` · ${t.lastViewed.replace("{date}", formatDate(l.lastViewedAt, lang))}` : ""}
                    </span>
                  </span>
                  <CopyButton text={url(l.token)} label={t.copy} done={t.copied} />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      startTransition(() => revoke(fd));
                    }}
                  >
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" disabled={revoking} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">
                      {t.off}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {createState.token && (
            <div role="status" className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3 text-xs">
              <p className="font-medium text-teal-ink">{t.newLink}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1">{url(createState.token)}</code>
                <CopyButton text={url(createState.token)} label={t.copy} done={t.copied} />
              </div>
            </div>
          )}
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(() => create(fd));
            }}
            className="mt-3 flex flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="caseStudyId" value={caseStudyId} />
            <label htmlFor={`sl-${caseStudyId}`} className="sr-only">
              {t.labelPlaceholder}
            </label>
            <input
              id={`sl-${caseStudyId}`}
              name="label"
              maxLength={80}
              placeholder={t.labelPlaceholder}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base sm:text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {creating ? t.creating : t.create}
            </button>
          </form>
          {createState.error && <p role="alert" className="mt-2 text-xs text-red-700">{say(createState.error)}</p>}
        </>
      )}
    </div>
  );
}
