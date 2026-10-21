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
import { usePathname } from "next/navigation";
import { splitLocale } from "@/i18n/config";
import { isPmAudiencePath } from "@/lib/audience/pm";

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
 * pages, never to signed-in members and never on property-manager pages or
 * the RFP writer. Stores the address in the existing regional_waitlist via
 * joinRegionalWaitlistAction.
 *
 * `inline` (the /rfps filter sidebar): a card in the page flow, so it never
 * covers results or the sticky CTAs; dismissing it hides it for 7 days.
 * Floating (default): appears half-way down the page (never before the
 * visitor scrolls), at most once every 7 days, as a small card on desktop
 * and a slim bar on phones.
 *
 * Persona QA 2026-10-21: the floating bar (shown after 5 s) covered the
 * bottom of the results and the sticky CTAs on a phone.
 */
export function EmailCapture({
  trade,
  region,
  categorySlug,
  regionSlug,
  signedInHint = false,
  inline = false,
}: {
  /** Display names, already translated. */
  trade?: string | null;
  region?: string | null;
  categorySlug?: string | null;
  regionSlug?: string | null;
  /** Server already knows the visitor is signed in. */
  signedInHint?: boolean;
  /** In the page flow (no overlay, no timer). */
  inline?: boolean;
}) {
  const t = useT("sharedClient").capture;
  const inputId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const pmPage = isPmAudiencePath(splitLocale(usePathname() ?? "/").path);

  useEffect(() => {
    if (signedInHint || pmPage || recentlySeen()) return;
    let cancelled = false;
    if (inline) {
      void signedIn().then((s) => {
        // Browser storage and the auth cookie only exist client-side.
        if (!cancelled && !s) setOpen(true);
      });
      return () => {
        cancelled = true;
      };
    }
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

    // No timer: only once the visitor has scrolled half-way.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [signedInHint, pmPage, inline]);

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
      className={
        inline
          ? "relative rounded-xl border border-border bg-card p-4"
          : "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[340px] sm:rounded-xl sm:border sm:p-4 sm:shadow-lg"
      }
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          // Dismissed: not again for 7 days.
          markSeen();
        }}
        aria-label={t.dismiss}
        className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
      <p id={titleId} className="pr-10 text-sm font-semibold leading-snug">
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
