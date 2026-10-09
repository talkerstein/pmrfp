/**
 * Forum staff guides (pure part): reference posts written and signed by the
 * real "PMRFP Team" staff account, never by a member persona.
 *
 * Honesty rules, enforced here and tested in test/forum-staff-guides.test.ts:
 *  - every guide is authored by the one PMRFP Team staff profile and stored
 *    with is_staff = true, so it renders with the staff badge;
 *  - the timestamp is the real moment of import (the database's now()), never
 *    backdated;
 *  - every guide ends with a dated, linked "Sources" block;
 *  - the importer only ever inserts threads: no replies, votes or ratings.
 * The DB side lives in staff-guides-server.ts; the content in
 * staff-guides-content.ts; the SQL fallback is generated from the same data
 * (briefs/ops/2026-10-09-forum-staff-guides.sql).
 */
import { createHash } from "node:crypto";
import { isForumCategory, type ForumCategorySlug } from "./categories";
import { MAX_BODY, MAX_TITLE, normalizeBody, normalizeTitle, slugify, wordCount } from "./text";

export const TEAM_HANDLE = "pmrfp_team";
export const TEAM_DISPLAY_NAME = "PMRFP Team";
export const TEAM_BIO =
  "The PMRFP staff account. Reference guides written and checked by the PMRFP team, each with links to the official sources. Not a member persona.";
/** auto_source_key prefix: guides reuse the auto-threads unique key for idempotency. */
export const GUIDE_KEY_PREFIX = "guide:";
/** At most this many guides are pinned per forum. */
export const MAX_PINS_PER_FORUM = 3;

export interface StaffGuide {
  /** Stable id (e.g. "A1"): the idempotency key, never reused for another guide. */
  key: string;
  category: ForumCategorySlug;
  lang: "en" | "fr";
  title: string;
  body: string;
  pinned: boolean;
}

export interface GuideDraft {
  sourceKey: string;
  shortId: string;
  category: ForumCategorySlug;
  title: string;
  slug: string;
  body: string;
  bodyWords: number;
  pinned: boolean;
}

export function guideSourceKey(key: string): string {
  return `${GUIDE_KEY_PREFIX}${key}`;
}

/** Deterministic short id ("g" + 9 hex chars of md5(key)), identical in the SQL fallback. */
export function guideShortId(key: string): string {
  return `g${createHash("md5").update(guideSourceKey(key)).digest("hex").slice(0, 9)}`;
}

/** Problems that would make a guide unsafe or unpostable (empty = fine). */
export function guideProblems(g: StaffGuide): string[] {
  const out: string[] = [];
  if (!/^[A-Za-z0-9-]{1,20}$/.test(g.key)) out.push("key");
  if (!isForumCategory(g.category)) out.push("category");
  const title = normalizeTitle(g.title);
  if (title.length < 8 || title.length > MAX_TITLE) out.push("title length");
  const body = normalizeBody(g.body);
  if (body.length < 200 || g.body.length > MAX_BODY) out.push("body length");
  if (!/\*\*Sources\*\*/.test(body)) out.push("no sources block");
  if (!/https:\/\//.test(body)) out.push("no source links");
  if (/\[[^\]]+\]\(https?:/.test(body)) out.push("markdown link (renders as text)");
  return out;
}

export function draftFor(g: StaffGuide): GuideDraft {
  const title = normalizeTitle(g.title);
  const body = normalizeBody(g.body);
  return {
    sourceKey: guideSourceKey(g.key),
    shortId: guideShortId(g.key),
    category: g.category,
    title,
    slug: slugify(title).slice(0, 80) || "guide",
    body,
    bodyWords: wordCount(body) + wordCount(title),
    pinned: g.pinned,
  };
}

/** Drafts for guides not imported yet (by key), in content order. Invalid guides are skipped. */
export function planStaffGuides(guides: readonly StaffGuide[], existing: Set<string>): GuideDraft[] {
  const seen = new Set(existing);
  const out: GuideDraft[] = [];
  for (const g of guides) {
    const key = guideSourceKey(g.key);
    if (seen.has(key) || guideProblems(g).length) continue;
    seen.add(key);
    out.push(draftFor(g));
  }
  return out;
}

/**
 * The forum_threads row for a draft. No created_at / last_post_at: the
 * database stamps the real import time.
 */
export function guideThreadRow(d: GuideDraft, categoryId: string, authorId: string) {
  return {
    short_id: d.shortId,
    category_id: categoryId,
    author_id: authorId,
    type: "discussion" as const,
    title: d.title,
    slug: d.slug,
    body: d.body,
    body_words: d.bodyWords,
    status: "approved" as const,
    is_staff: true,
    is_pinned: d.pinned,
    auto_source_key: d.sourceKey,
  };
}

// ── SQL fallback (same data, same keys, same short ids) ────────────────
function dollar(s: string): string {
  let tag = "guide";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function buildStaffGuideSql(guides: readonly StaffGuide[], opts: { date: string; teamEmail?: string }): string {
  const email = (opts.teamEmail ?? "forum-team@pmrfp.com").toLowerCase();
  const drafts = planStaffGuides(guides, new Set());
  const head = `-- ════════════════════════════════════════════════════════════════════
-- Forum staff guides: ${drafts.length} reference posts by the PMRFP Team staff account.
-- Generated from src/lib/forum/staff-guides-content.ts (${opts.date}); do not edit by hand.
-- Same keys and short ids as the "Import staff guides" button on /admin/forum,
-- so running both never duplicates anything. Safe to re-run:
--   * the PMRFP Team profile is looked up first and only created when missing
--     (a sign-in-banned auth user with no password, like the PMRFP Board);
--   * every thread insert is ON CONFLICT (auto_source_key) DO NOTHING;
--   * created_at is the database's now(): the real time you run this.
-- Needs supabase/migrations/20261006000002_forum.sql (and the auto_source_key
-- column from 20261008000001_forum_auto_threads.sql, re-declared below).
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.forum_threads add column if not exists auto_source_key text;
create unique index if not exists forum_threads_auto_source_key_idx
  on public.forum_threads(auto_source_key) where auto_source_key is not null;

-- 1. The PMRFP Team staff account (lookup, create only if missing).
do $$
declare
  team uuid;
  em constant text := ${lit(email)};
begin
  select user_id into team from public.forum_profiles where handle = ${lit(TEAM_HANDLE)};
  if team is null then
    select id into team from auth.users where lower(email) = em limit 1;
    if team is null then
      team := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', team, 'authenticated', 'authenticated', em, '', now(), now() + interval '100 years',
        '{"provider":"email","providers":["email"],"system":"forum-team"}'::jsonb,
        '{"full_name":"${TEAM_DISPLAY_NAME}","primary_role":"visitor","system":"forum-team"}'::jsonb,
        now(), now(), '', '', '', ''
      );
    end if;
    insert into public.forum_profiles (user_id, handle, display_name, bio, is_staff)
    values (team, ${lit(TEAM_HANDLE)}, ${lit(TEAM_DISPLAY_NAME)}, ${lit(TEAM_BIO)}, true)
    on conflict (user_id) do update set is_staff = true;
  else
    update public.forum_profiles set is_staff = true where user_id = team;
  end if;
end $$;

-- 2. The guides.
`;
  const rows = drafts.map(
    (d) => `insert into public.forum_threads
  (short_id, category_id, author_id, type, title, slug, body, body_words, status, is_staff, is_pinned, auto_source_key)
select ${lit(d.shortId)}, c.id, p.user_id, 'discussion', ${dollar(d.title)}, ${lit(d.slug)},
  ${dollar(d.body)},
  ${d.bodyWords}, 'approved', true, ${d.pinned}, ${lit(d.sourceKey)}
from public.forum_categories c, public.forum_profiles p
where c.slug = ${lit(d.category)} and p.handle = ${lit(TEAM_HANDLE)}
on conflict (auto_source_key) where auto_source_key is not null do nothing;
`,
  );
  const tail = `
commit;

-- Check: select count(*) from public.forum_threads where auto_source_key like 'guide:%';  -- expect ${drafts.length}
`;
  return `${head}${rows.join("\n")}${tail}`;
}
