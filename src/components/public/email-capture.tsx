"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { joinRegionalWaitlistAction } from "@/lib/waitlist/actions";
import { CONSENT_EVENT, consentPending } from "@/components/analytics-consent";

const SEEN_KEY = "pmrfp-capture-seen";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function recentlySeen(): boolean {
  try {
    const at = Number(window.localStorage.getItem(SEEN_KEY));
    return Number.isFinite(at) && Date.now() - at < WEEK_MS;
  } catch {
    // Storage blocked: we can't honour "once a week", so don't show at all.
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

async function signedIn(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    // Reads the auth cookie locally; no network round-trip.
    const { data } = await createClient().auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/**
 * "Get new [trade/region] tenders by email" prompt for the RFP board and RFP
 * pages. Appears after 5 s or half-way down the page, whichever is first, at
 * most once every 7 days, never to signed-in members. A small card on desktop,
 * a slim bar on phones (no full-screen interstitial). Stores the address in
 * the existing regional_waitlist via joinRegionalWaitlistAction.
 */
export function EmailCapture({
  trade,
  region,
  categorySlug,
  regionSlug,
  signedInHint = false,
}: {
  /** Display names, already translated. */
  trade?: string | null;
  region?: string | null;
  categorySlug?: string | null;
  regionSlug?: string | null;
  /** Server already knows the visitor is signed in. */
  signedInHint?: boolean;
}) {
  const t = useT("sharedClient").capture;
  const inputId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => {
    if (signedInHint || recentlySeen()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(CONSENT_EVENT, onConsent);
    };
    async function show() {
      cleanup();
      if (cancelled || recentlySeen()) return;
      if (consentPending()) {
        // Let the cookie banner finish first; one bottom prompt at a time.
        window.addEventListener(CONSENT_EVENT, onConsent, { once: true });
        return;
      }
      if (await signedIn()) return;
      if (cancelled) return;
      markSeen();
      setOpen(true);
    }
    function onConsent() {
      timer = setTimeout(show, 1500);
    }
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= 0.5) void show();
    }

    timer = setTimeout(show, 5000);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [signedInHint]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const what = [trade, region].filter(Boolean).join(" · ") || t.fallback;
  const title = fmt(t.title, { what });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("role", "visitor");
    fd.set("reason", "early_access");
    if (categorySlug) fd.set("categorySlug", categorySlug);
    if (regionSlug) fd.set("regionSlug", regionSlug);
    else if (region) fd.set("requestedRegionText", region);
    setStatus("sending");
    try {
      const res = await joinRegionalWaitlistAction({}, fd);
      setStatus(res.error ? "error" : "done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <aside
      role="complementary"
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[340px] sm:rounded-xl sm:border sm:p-4 sm:shadow-lg"
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t.dismiss}
        className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
      <p id={titleId} className="pr-8 text-sm font-semibold leading-snug">
        {title}
      </p>
      {status === "done" ? (
        <p role="status" className="mt-1.5 text-sm text-teal-ink">
          {t.done}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-2 flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            {t.email}
          </label>
          <Input
            id={inputId}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t.placeholder}
            className="h-9 min-w-0 flex-1"
          />
          {/* Honeypot, same field the waitlist action checks. */}
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={status === "sending"}>
            {status === "sending" ? t.sending : t.submit}
          </Button>
        </form>
      )}
      {status === "error" && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {t.error}
        </p>
      )}
    </aside>
  );
}
