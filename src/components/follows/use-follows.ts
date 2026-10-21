"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The signed-in person's follows, for the Follow buttons on public (cached)
 * pages. A page doesn't know who's looking, so the browser asks
 * /api/follows once, and only when a sign-in cookie is there: anonymous
 * visitors and crawlers never cause a request.
 */

export interface FollowUsageView {
  used: number;
  limit: number | null;
  left: number | null;
  full: boolean;
}

export interface FollowState {
  /** null until known. */
  signedIn: boolean | null;
  canFollow: boolean;
  keys: ReadonlySet<string>;
  usage: FollowUsageView | null;
  unavailable?: boolean;
}

export type ToggleResult = "followed" | "unfollowed" | "limit" | "sign-up" | "role" | "unavailable" | "error";

/** A Supabase session cookie ("sb-<ref>-auth-token", maybe chunked) is present. */
export function hasSessionCookie(cookie: string): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookie);
}

const INITIAL: FollowState = { signedIn: null, canFollow: false, keys: new Set(), usage: null };

export function useFollows(buyerKey?: string) {
  const [state, setState] = useState<FollowState>(INITIAL);

  useEffect(() => {
    let live = true;
    const signedOut: FollowState = { ...INITIAL, signedIn: false };
    const load: Promise<FollowState> = hasSessionCookie(document.cookie)
      ? fetch(`/api/follows${buyerKey ? `?buyer=${encodeURIComponent(buyerKey)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
          .then((r) => r.json())
          .then((j: { signedIn?: boolean; canFollow?: boolean; keys?: string[]; usage?: FollowUsageView; unavailable?: boolean }) => ({
            signedIn: Boolean(j.signedIn),
            canFollow: Boolean(j.canFollow),
            keys: new Set(j.keys ?? []),
            usage: j.usage ?? null,
            unavailable: j.unavailable,
          }))
          .catch(() => signedOut)
      : Promise.resolve(signedOut);
    load.then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [buyerKey]);

  const toggle = useCallback(async (key: string, follow: boolean): Promise<ToggleResult> => {
    let res: Response;
    try {
      res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ buyer: key, action: follow ? "follow" : "unfollow" }),
      });
    } catch {
      return "error";
    }
    const j = (await res.json().catch(() => ({}))) as { usage?: FollowUsageView; reason?: string; demo?: boolean };
    if (res.status === 401) return "sign-up";
    if (res.status === 403) return "role";
    if (res.status === 503) return "unavailable";
    if (res.status === 409 || j.reason === "limit") {
      if (j.usage) setState((s) => ({ ...s, usage: j.usage! }));
      return "limit";
    }
    if (!res.ok) return "error";
    setState((s) => {
      const keys = new Set(s.keys);
      if (follow) keys.add(key);
      else keys.delete(key);
      return { ...s, keys, usage: j.usage ?? s.usage };
    });
    return follow ? "followed" : "unfollowed";
  }, []);

  return { state, toggle };
}
