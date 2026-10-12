/**
 * The same project listed by more than one source: a Québec PQI row and an
 * Infrastructure Canada funding row, a Toronto development application and
 * the later building permit on the same address. Rows are LINKED (same
 * link_group), never merged: each keeps its own facts, source and licence,
 * and the project page points to the other listings.
 *
 * Heuristics (only rows from DIFFERENT sources, same province):
 *   - same city and the same street address (permit / application titles
 *     end in " — <address>"), or
 *   - same city (or one side has no city) and names that share most of
 *     their meaningful words, with values that don't contradict each other
 *     (either missing, or within 2x).
 * computeLinkGroups() is pure (unit tested); refreshLinkGroups() runs it
 * after each weekly import over the live public rows and writes only the
 * rows whose group changed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/tenders/shared";
import { addressKey } from "./sources-wave2";

export interface LinkRow {
  id: string;
  source: string;
  name: string;
  city: string | null;
  province: string | null;
  estValueCad: number | null;
}

const STOP = new Set(
  (
    "the a an of and for to in at on with by from de du des la le les et d l au aux en sur pour " +
    "project projet projects new phase construction building buildings batiment batiments renovation renovations rehabilitation " +
    "replacement upgrade upgrades expansion improvements agrandissement reamenagement refection reconstruction amenagement " +
    "city ville municipality town site plan application rezoning development permit storey residential mixed use units unit homes " +
    "centre center ltd inc"
  ).split(" "),
);

/** Meaningful name words (no address part, no stop words, no bare numbers). */
export function nameTokens(name: string, city?: string | null): Set<string> {
  const cityWords = new Set(slugify(city ?? "").split("-"));
  return new Set(
    slugify(name.split(" — ")[0])
      .split("-")
      .filter((t) => t.length > 1 && !STOP.has(t) && !cityWords.has(t) && !/^\d+$/.test(t)),
  );
}

/** The street address at the end of a permit / application title, normalised. */
export function titleAddress(name: string): string | null {
  const i = name.lastIndexOf(" — ");
  if (i < 0) return null;
  const a = addressKey(name.slice(i + 3).replace(/^\d+[a-z]?,\s*/i, ""));
  return /^\d/.test(a) && a.length >= 5 ? a : null;
}

function similarity(a: Set<string>, b: Set<string>): { shared: number; jaccard: number; contained: boolean } {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return { shared, jaccard: union ? shared / union : 0, contained: shared > 0 && shared === Math.min(a.size, b.size) };
}

function valuesAgree(a: number | null, b: number | null): boolean {
  if (!a || !b) return true;
  return Math.max(a, b) / Math.min(a, b) <= 2;
}

/** id → link group (the smallest member id), for rows that match another source's row. */
export function computeLinkGroups(rows: readonly LinkRow[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const r of rows) parent.set(r.id, r.id);

  const prepared = rows
    .filter((r) => r.province)
    .map((r) => ({ ...r, cityKey: slugify(r.city ?? ""), tokens: nameTokens(r.name, r.city), address: titleAddress(r.name) }));
  const byProvince = new Map<string, typeof prepared>();
  for (const r of prepared) byProvince.set(r.province!, [...(byProvince.get(r.province!) ?? []), r]);

  for (const list of byProvince.values()) {
    // Block by city; rows without a city are compared with the whole province.
    const byCity = new Map<string, typeof prepared>();
    for (const r of list) if (r.cityKey) byCity.set(r.cityKey, [...(byCity.get(r.cityKey) ?? []), r]);
    const noCity = list.filter((r) => !r.cityKey);
    const tryPair = (a: (typeof prepared)[number], b: (typeof prepared)[number]) => {
      if (a.source === b.source) return;
      const sameCity = Boolean(a.cityKey && a.cityKey === b.cityKey);
      if (sameCity && a.address && a.address === b.address) return union(a.id, b.id);
      if (a.tokens.size < 2 || b.tokens.size < 2 || !valuesAgree(a.estValueCad, b.estValueCad)) return;
      const s = similarity(a.tokens, b.tokens);
      const ok = sameCity ? s.shared >= 2 && (s.jaccard >= 0.6 || s.contained) : s.shared >= 3 && s.jaccard >= 0.8;
      if (ok) union(a.id, b.id);
    };
    for (const group of byCity.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) tryPair(group[i], group[j]);
    for (const a of noCity) for (const b of list) if (a.id !== b.id && (b.cityKey || a.id < b.id)) tryPair(a, b);
  }

  const members = new Map<string, string[]>();
  for (const r of rows) {
    const root = find(r.id);
    members.set(root, [...(members.get(root) ?? []), r.id]);
  }
  const out = new Map<string, string>();
  for (const [root, ids] of members) if (ids.length > 1) for (const id of ids) out.set(id, root);
  return out;
}

/* ------------------------------------------------------------------ apply */

const PAGE = 1000;
const IN_BATCH = 100;

interface DbLinkRow {
  id: string;
  source: string;
  name: string;
  city: string | null;
  province: string | null;
  est_value_cad: number | string | null;
  link_group: string | null;
  stale: boolean;
  approved: boolean;
  review_status: string;
}

/**
 * Recompute link groups over every live public row and write the changes
 * (sequential, 100 ids per statement). Returns how many groups exist and
 * how many rows changed.
 */
export async function refreshLinkGroups(supabase: SupabaseClient): Promise<{ groups: number; linked: number; changed: number }> {
  const all: DbLinkRow[] = [];
  let after: string | null = null;
  for (;;) {
    let q = supabase.from("major_projects").select("id,source,name,city,province,est_value_cad,link_group,stale,approved,review_status").order("id").limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error(`major_projects links read: ${error.message}`);
    const page = (data ?? []) as DbLinkRow[];
    all.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  const live = all.filter((r) => !r.stale && r.review_status !== "rejected" && (r.source !== "manual" || r.approved));
  const groups = computeLinkGroups(
    live.map((r) => ({ id: r.id, source: r.source, name: r.name, city: r.city, province: r.province, estValueCad: r.est_value_cad == null ? null : Number(r.est_value_cad) })),
  );
  const changes = new Map<string | null, string[]>();
  for (const r of all) {
    const next = groups.get(r.id) ?? null;
    if (next !== r.link_group) changes.set(next, [...(changes.get(next) ?? []), r.id]);
  }
  let changed = 0;
  for (const [group, ids] of changes) {
    for (let i = 0; i < ids.length; i += IN_BATCH) {
      const chunk = ids.slice(i, i + IN_BATCH);
      const { error } = await supabase.from("major_projects").update({ link_group: group }).in("id", chunk);
      if (error) throw new Error(`major_projects links write: ${error.message}`);
      changed += chunk.length;
    }
  }
  return { groups: new Set(groups.values()).size, linked: groups.size, changed };
}
