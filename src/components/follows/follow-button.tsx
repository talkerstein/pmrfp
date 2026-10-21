"use client";

import { useState, useSyncExternalStore } from "react";
import { useFollows, type ToggleResult } from "./use-follows";

/**
 * "Follow" for one buyer or town, on its public (cached) page and on the
 * public tenders it lists. Signed out: the button goes to sign-up with the
 * follow kept (it completes after onboarding and brings them back here).
 * Signed in: follows / unfollows in place, shows "2 of 3 free follows used —
 * Pro is unlimited" to free accounts, and says why when a free account is
 * at its limit or the account can't follow (property managers, public
 * buyers). Copy comes from the server (follows namespace), as props.
 */

export interface FollowButtonLabels {
  follow: string;
  following: string;
  unfollow: string;
  followAria: string;
  unfollowAria: string;
  /** "{used} of {limit} free follows used — Pro is unlimited" */
  usage: string;
  limit: string;
  upgrade: string;
  manage: string;
  role: string;
  error: string;
  unavailable: string;
  followed: string;
  unfollowed: string;
  signUp: string;
  /** "{n} contractors follow this town" (one / other); absent: no count shown. */
  followers?: { one: string; other: string };
  first?: string;
}

const noSubscribe = () => () => {};

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function FollowButton({
  buyerKey,
  signUpHref,
  manageHref,
  upgradeHref,
  followers = 0,
  labels: t,
  compact = false,
  locale = "en-CA",
}: {
  buyerKey: string;
  /** Localized sign-up link carrying the follow (lib/follows/rules followSignUpHref). */
  signUpHref: string;
  manageHref: string;
  upgradeHref: string;
  followers?: number;
  labels: FollowButtonLabels;
  /** A small pill (tender pages, lists) instead of the big call-to-action button. */
  compact?: boolean;
  /** BCP 47 tag for the count (same on the server and in the browser). */
  locale?: string;
}) {
  const { state, toggle } = useFollows(buyerKey);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: ToggleResult; text: string } | null>(null);
  const [count, setCount] = useState(followers);
  const following = state.keys.has(buyerKey);

  // Back from sign-up: /follow sends people here with ?follow=done (read from the URL, not stored).
  const arrived = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("follow"), () => null);
  const shown = note ?? (arrived === "done" && following ? { kind: "followed" as const, text: t.followed } : null);

  async function onClick() {
    if (state.signedIn === false) {
      window.location.assign(signUpHref);
      return;
    }
    if (state.signedIn !== true || busy) return;
    if (!state.canFollow) {
      setNote({ kind: "role", text: t.role });
      return;
    }
    setBusy(true);
    const r = await toggle(buyerKey, !following);
    setBusy(false);
    if (r === "sign-up") {
      window.location.assign(signUpHref);
      return;
    }
    if (r === "followed") setCount((c) => c + 1);
    if (r === "unfollowed") setCount((c) => Math.max(0, c - 1));
    const text = { followed: t.followed, unfollowed: t.unfollowed, limit: t.limit, role: t.role, unavailable: t.unavailable, error: t.error, "sign-up": "" }[r];
    setNote(text ? { kind: r, text } : null);
  }

  const usage = state.usage;
  const showUsage = state.signedIn && state.canFollow && usage && usage.limit != null;
  const label = following ? t.following : t.follow;
  const aria = following ? t.unfollowAria : t.followAria;

  if (compact) {
    return (
      <span className="fl-compact" data-follow={buyerKey} data-following={following ? "1" : "0"}>
        <button type="button" className={`fl-pill${following ? " on" : ""}`} onClick={onClick} disabled={busy} aria-pressed={following} aria-label={aria}>
          {following ? "✓ " : "+ "}
          {label}
        </button>
        {shown && (
          <span className="fl-note small" role="status">
            {shown.text}
            {shown.kind === "limit" && <> <a href={upgradeHref}>{t.upgrade} →</a></>}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="fl-block" data-follow={buyerKey} data-following={following ? "1" : "0"}>
      <div className="acts">
        <button type="button" className={`btn lg ${following ? "ghost" : "mint"}`} onClick={onClick} disabled={busy} aria-pressed={following} aria-label={aria}>
          {following ? `✓ ${t.following}` : t.follow}
        </button>
        {following && (
          <button type="button" className="fl-link" onClick={onClick} disabled={busy}>
            {t.unfollow}
          </button>
        )}
        {following && <a className="lnk" href={manageHref}>{t.manage} →</a>}
      </div>
      {state.signedIn === false && <p className="small fl-sub">{t.signUp}</p>}
      {showUsage && (
        <p className="small fl-sub" data-usage={`${usage.used}/${usage.limit}`}>
          {fill(t.usage, { used: Math.min(usage.used, usage.limit!), limit: usage.limit! })}
          {usage.full && <> · <a className="lnk" href={upgradeHref}>{t.upgrade} →</a></>}
        </p>
      )}
      {t.followers && (
        <p className="small fl-sub" data-followers={count}>
          {count > 0 ? fill(count === 1 ? t.followers.one : t.followers.other, { n: count.toLocaleString(locale) }) : t.first}
        </p>
      )}
      {shown && (
        <p className="small fl-note" role="status" data-note={shown.kind}>
          {shown.text}
          {shown.kind === "limit" && <> <a className="lnk" href={upgradeHref}>{t.upgrade} →</a></>}
        </p>
      )}
    </div>
  );
}
