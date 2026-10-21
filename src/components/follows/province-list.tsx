"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { localizePath, type Locale } from "@/i18n/config";
import { filterBuyers, type CompactBuyer, type ProvinceGroup } from "@/lib/buyers/province-list";
import { followIntentPath, followSignUpHref } from "@/lib/follows/rules";
import { useFollows } from "./use-follows";

/**
 * /buyers/<province>: every town and public buyer in the province, grouped,
 * with a search box and an "only with open bids" filter that work in the
 * browser over the compact list the page ships (no requests). Each row has
 * its badges (Verified, Listed with permission, N open bids) and a small
 * Follow button; the person's follows are read once for the whole list.
 */

export interface ProvinceListLabels {
  searchLabel: string;
  searchPlaceholder: string;
  openOnly: string;
  /** "{shown} of {n} shown" */
  shown: string;
  none: string;
  groups: Record<ProvinceGroup, string>;
  verified: string;
  listed: string;
  open: { one: string; other: string };
  /** "Population {n}" */
  population: string;
  follow: string;
  following: string;
  /** "Follow {name}" */
  followAria: string;
  unfollowAria: string;
  limit: string;
  upgrade: string;
  role: string;
  error: string;
  unavailable: string;
  /** "{used} of {limit} free follows used — Pro is unlimited" */
  usage: string;
}

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function ProvinceBuyerList({
  items,
  provinceSlug,
  regionSlug,
  lang,
  locale,
  upgradeHref,
  labels: t,
}: {
  items: CompactBuyer[];
  provinceSlug: string;
  /** Region picked at sign-up when a signed-out visitor follows from here. */
  regionSlug: string | null;
  lang: Locale;
  /** BCP 47 tag for numbers. */
  locale: string;
  upgradeHref: string;
  labels: ProvinceListLabels;
}) {
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const query = useDeferredValue(q);
  const shown = useMemo(() => filterBuyers(items, query, openOnly), [items, query, openOnly]);
  const groups = useMemo(() => {
    const by = new Map<ProvinceGroup, CompactBuyer[]>();
    for (const i of shown) by.set(i.g, [...(by.get(i.g) ?? []), i]);
    return [...by.entries()];
  }, [shown]);
  const { state, toggle } = useFollows();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; limit?: boolean } | null>(null);
  const num = (n: number) => n.toLocaleString(locale);
  const keyOf = (s: string) => `${provinceSlug}/${s}`;

  async function onFollow(i: CompactBuyer) {
    const key = keyOf(i.s);
    const signUp = localizePath(followSignUpHref(localizePath(followIntentPath(key), lang), regionSlug), lang);
    if (state.signedIn === false) {
      window.location.assign(signUp);
      return;
    }
    if (state.signedIn !== true || busy) return;
    if (!state.canFollow) {
      setNote({ text: t.role });
      return;
    }
    setBusy(key);
    const r = await toggle(key, !state.keys.has(key));
    setBusy(null);
    if (r === "sign-up") window.location.assign(signUp);
    else if (r === "limit") setNote({ text: t.limit, limit: true });
    else if (r === "role") setNote({ text: t.role });
    else if (r === "unavailable") setNote({ text: t.unavailable });
    else if (r === "error") setNote({ text: t.error });
    else setNote(null);
  }

  const usage = state.usage;
  return (
    <div className="pv-wrap">
      <div className="pv-tools">
        <div className="pv-search">
          <label htmlFor="pv-q">{t.searchLabel}</label>
          <input id="pv-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchPlaceholder} autoComplete="off" />
        </div>
        <label className="pv-check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          {t.openOnly}
        </label>
      </div>
      <p className="pv-shown" aria-live="polite">
        {fill(t.shown, { shown: num(shown.length), n: num(items.length) })}
        {state.signedIn && state.canFollow && usage && usage.limit != null && <> · {fill(t.usage, { used: Math.min(usage.used, usage.limit), limit: usage.limit })}</>}
      </p>
      {note && (
        <p className="pv-shown" role="status">
          <b>{note.text}</b>
          {note.limit && <> <a href={upgradeHref}>{t.upgrade} →</a></>}
        </p>
      )}
      {groups.length > 1 && (
        <nav className="pv-jump" aria-label={t.searchLabel}>
          {groups.map(([g, rows]) => (
            <a key={g} href={`#g-${g}`}>{t.groups[g]} ({num(rows.length)})</a>
          ))}
        </nav>
      )}
      {!shown.length && <p className="muted" style={{ marginTop: 20 }}>{t.none}</p>}
      {groups.map(([g, rows]) => (
        <section key={g} className="pv-group" id={`g-${g}`} data-group={g}>
          <h3>
            {t.groups[g]}
            <span className="n">{num(rows.length)}</span>
          </h3>
          <ul className="pv-list" data-list="buyers">
            {rows.map((i) => {
              const key = keyOf(i.s);
              const on = state.keys.has(key);
              return (
                <li key={i.s} data-slug={i.s}>
                  <span>
                    <a className="nm" href={localizePath(`/buyers/${key}`, lang)}>{i.n}</a>
                    {(i.v || i.l || i.o) && (
                      <span className="pv-badges">
                        {i.v && <span className="pv-badge ok" data-badge="verified">✓ {t.verified}</span>}
                        {i.l && <span className="pv-badge perm" data-badge="listed">{t.listed}</span>}
                        {i.o && <span className="pv-badge open" data-badge="open">{fill(i.o === 1 ? t.open.one : t.open.other, { n: i.o >= 12 ? "12+" : num(i.o) })}</span>}
                      </span>
                    )}
                    {i.p != null && <span className="meta">{fill(t.population, { n: num(i.p) })}</span>}
                  </span>
                  <button type="button" className={`fl-pill${on ? " on" : ""}`} onClick={() => onFollow(i)} disabled={busy === key} aria-pressed={on} aria-label={fill(on ? t.unfollowAria : t.followAria, { name: i.n })}>
                    {on ? `✓ ${t.following}` : `+ ${t.follow}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
