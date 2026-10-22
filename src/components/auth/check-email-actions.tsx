"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { resendSignupLinkAction, type ActionState } from "@/lib/auth/actions";
import { afterResend, countdownLabel, resendStatus, type ResendState } from "@/lib/auth/resend";
import { fmt } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

export interface CheckEmailLabels {
  openMail: string;
  resend: string;
  resendIn: string;
  resending: string;
  resent: string;
  resendLimit: string;
  wrongEmail: string;
  startOver: string;
  sameBrowser: string;
}

const STORE = "pmrfp.resend";

function loadState(email: string): ResendState {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) {
      const o = JSON.parse(raw) as { e?: string; at?: number; n?: number };
      // Same screen, same address: the cooldown survives a reload.
      if (o.e === email && typeof o.at === "number" && typeof o.n === "number") return { lastSentAt: o.at, sent: o.n };
    }
  } catch {
    /* storage off */
  }
  // First visit: the sign-up itself just sent the first link.
  return { lastSentAt: Date.now(), sent: 0 };
}

function saveState(email: string, s: ResendState) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ e: email, at: s.lastSentAt, n: s.sent }));
  } catch {
    /* storage off */
  }
}

/**
 * Under the "check your email" message: open the inbox (when we can tell
 * which one), send the link again (with a one-minute cooldown), or go back
 * if the address was wrong. The address is posted to the server action and
 * kept in this tab's sessionStorage only for the cooldown; it is never put
 * in a URL we build.
 */
export function CheckEmailActions({
  email,
  role,
  next,
  lang,
  provider,
  startOverHref,
  t,
}: {
  email: string;
  role: string | null;
  next: string | null;
  lang: Locale;
  provider: { name: string; href: string } | null;
  startOverHref: string;
  t: CheckEmailLabels;
}) {
  const [state, action, pending] = useActionState(resendSignupLinkAction, {} as ActionState);
  const [rs, setRs] = useState<ResendState | null>(null);
  const [now, setNow] = useState(0);
  const counted = useRef<ActionState | null>(null);

  // Read the cooldown on the client only (no hydration mismatch), then tick once a second.
  useEffect(() => {
    const boot = setTimeout(() => {
      setRs((cur) => cur ?? loadState(email));
      setNow(Date.now());
    }, 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(boot);
      clearInterval(id);
    };
  }, [email]);

  // A successful re-send restarts the cooldown (once per result).
  useEffect(() => {
    if (!state.success || counted.current === state) return;
    counted.current = state;
    setRs((cur) => {
      const next = afterResend(cur ?? { lastSentAt: Date.now(), sent: 0 }, Date.now());
      saveState(email, next);
      return next;
    });
  }, [state, email]);

  const status = rs ? resendStatus(rs, now) : null;
  const waiting = status && !status.can && status.reason === "wait" ? status.secondsLeft : 0;
  const limited = status && !status.can && status.reason === "limit";
  const disabled = !status || !status.can || pending;

  return (
    <div className="v3-su-mail" data-testid="check-email-actions">
      {provider && (
        <a className="v3-su-go v3-su-mail-open" href={provider.href} target="_blank" rel="noopener noreferrer">
          {fmt(t.openMail, { name: provider.name })}
        </a>
      )}
      <form action={action} className="v3-su-mail-resend">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="lang" value={lang} />
        {role && <input type="hidden" name="role" value={role} />}
        {next && <input type="hidden" name="next" value={next} />}
        {!limited && (
          <button type="submit" className="v3-su-back" disabled={disabled} aria-live="polite">
            {pending ? t.resending : waiting > 0 ? fmt(t.resendIn, { time: countdownLabel(waiting) }) : t.resend}
          </button>
        )}
      </form>
      <p role="status" className="v3-su-fine" style={{ marginTop: 0 }}>
        {state.error ? state.error : limited ? t.resendLimit : state.success && waiting > 0 ? t.resent : null}
      </p>
      <p className="v3-su-fine" style={{ marginTop: 8 }}>{t.sameBrowser}</p>
      <p className="v3-su-fine" style={{ marginTop: 8 }}>
        {t.wrongEmail} <a href={startOverHref} style={{ fontWeight: 700 }}>{t.startOver}</a>
      </p>
    </div>
  );
}

