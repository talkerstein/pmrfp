import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  GUIDE_KEY_PREFIX,
  MAX_PINS_PER_FORUM,
  TEAM_DISPLAY_NAME,
  TEAM_HANDLE,
  buildStaffGuideSql,
  guideProblems,
  guideShortId,
  guideThreadRow,
  planStaffGuides,
  type StaffGuide,
} from "@/lib/forum/staff-guides";
import { STAFF_GUIDES } from "@/lib/forum/staff-guides-content";
import { runStaffGuideImport } from "@/lib/forum/staff-guides-server";
import { isForumCategory } from "@/lib/forum/categories";
import type { SupabaseClient } from "@supabase/supabase-js";

const SQL_PATH = "briefs/ops/2026-10-09-forum-staff-guides.sql";

function guide(over: Partial<StaffGuide> = {}): StaffGuide {
  return {
    key: "T1",
    category: "ontario",
    lang: "en",
    title: "Ontario holdback deadlines in one place",
    body:
      "What this covers: the basic holdback.\n\nOwners keep back 10% of the value of work done. ".repeat(4) +
      "\n\n**Sources** (checked October 9, 2026)\n- Construction Act: https://www.ontario.ca/laws/statute/90c30\n\nGeneral information, not legal advice.",
    pinned: true,
    ...over,
  };
}

/** A fake service client: records inserts, enforces the unique auto_source_key like Postgres. */
function fakeDb(opts: { teamExists?: boolean; staleReads?: boolean } = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const threads: Record<string, unknown>[] = [];
  const profiles: Record<string, unknown>[] = opts.teamExists ? [{ user_id: "team", handle: TEAM_HANDLE }] : [];
  const created: string[] = [];
  const db = {
    auth: {
      admin: {
        createUser: async (u: { email: string }) => {
          created.push(u.email);
          return { data: { user: { id: "team" } }, error: null };
        },
        listUsers: async () => ({ data: { users: [] } }),
      },
    },
    from(table: string) {
      const rows = () => (table === "forum_threads" ? (opts.staleReads ? [] : threads) : table === "forum_profiles" ? profiles : table === "forum_categories" ? [{ id: "cat-on", slug: "ontario" }, { id: "cat-qc", slug: "quebec" }] : []);
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const m of ["select", "eq", "like", "limit", "update", "order"]) q[m] = chain;
      q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      q.upsert = async (row: Record<string, unknown>) => {
        profiles.push(row);
        return { error: null };
      };
      q.insert = async (row: Record<string, unknown>) => {
        if (table === "forum_threads" && threads.some((t) => t.auto_source_key === row.auto_source_key)) {
          return { error: { code: "23505", message: "duplicate key value violates unique constraint forum_threads_auto_source_key_idx" } };
        }
        inserts.push({ table, row });
        if (table === "forum_threads") threads.push(row);
        return { error: null };
      };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res);
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, inserts, threads, profiles, created };
}

describe("staff guide planning", () => {
  it("keys every guide and skips ones already imported", () => {
    const a = guide();
    const b = guide({ key: "T2", title: "Alberta prompt payment deadlines in one place" });
    expect(planStaffGuides([a, b], new Set()).map((d) => d.sourceKey)).toEqual(["guide:T1", "guide:T2"]);
    expect(planStaffGuides([a, b], new Set(["guide:T1"])).map((d) => d.sourceKey)).toEqual(["guide:T2"]);
    expect(planStaffGuides([a, a], new Set())).toHaveLength(1);
  });

  it("uses a deterministic short id that matches the forum URL pattern", () => {
    expect(guideShortId("A1")).toBe(guideShortId("A1"));
    expect(guideShortId("A1")).not.toBe(guideShortId("A2"));
    expect(guideShortId("A1")).toMatch(/^[a-z0-9]{6,12}$/);
  });

  it("rejects guides without linked sources, or with markdown links that would render as text", () => {
    expect(guideProblems(guide())).toEqual([]);
    expect(guideProblems(guide({ body: "x".repeat(300) }))).toContain("no sources block");
    expect(guideProblems(guide({ body: guide().body + " [CRA](https://canada.ca)" }))).toContain("markdown link (renders as text)");
    expect(planStaffGuides([guide({ body: "too short" })], new Set())).toHaveLength(0);
  });

  it("builds a staff row stamped by the database (no created_at: never backdated)", () => {
    const [d] = planStaffGuides([guide()], new Set());
    const row = guideThreadRow(d, "cat-on", "team");
    expect(row).toMatchObject({ author_id: "team", is_staff: true, status: "approved", type: "discussion", is_pinned: true, auto_source_key: "guide:T1" });
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("last_post_at");
  });
});

describe("staff guide import (DB side)", () => {
  it("previews without writing, imports once, and a re-run creates nothing", async () => {
    const f = fakeDb();
    const guides = [guide(), guide({ key: "T2", category: "quebec", lang: "fr", title: "Paiement rapide au Québec : où en est-on" })];

    const dry = await runStaffGuideImport(f.db, { dry: true, guides });
    expect(dry).toMatchObject({ ready: true, planned: 2, created: 0 });
    expect(f.inserts).toHaveLength(0);
    expect(f.created).toHaveLength(0);

    const first = await runStaffGuideImport(f.db, { dry: false, guides });
    expect(first.created).toBe(2);
    // Only thread rows (plus the one staff profile): no posts, votes, ratings or reputation.
    expect(new Set(f.inserts.map((i) => i.table))).toEqual(new Set(["forum_threads"]));
    expect(f.profiles).toEqual([expect.objectContaining({ handle: TEAM_HANDLE, display_name: TEAM_DISPLAY_NAME, is_staff: true })]);
    expect(f.threads.every((t) => t.author_id === "team" && t.is_staff === true)).toBe(true);

    const again = await runStaffGuideImport(f.db, { dry: false, guides });
    expect(again).toMatchObject({ planned: 0, created: 0, alreadyImported: 2 });
    expect(f.threads).toHaveLength(2);
  });

  it("treats a concurrent duplicate (unique key) as already imported, not a failure", async () => {
    // The pre-read misses it (e.g. the SQL file ran between preview and import).
    const f = fakeDb({ teamExists: true, staleReads: true });
    f.threads.push({ auto_source_key: "guide:T1" });
    const r = await runStaffGuideImport(f.db, { dry: false, guides: [guide()] });
    expect(r.created).toBe(0);
    expect(r.failed).toBe(0);
    expect(f.created).toHaveLength(0); // existing staff profile reused
  });
});

describe("the shipped guides", () => {
  it("are all valid, uniquely keyed, linked to official sources, and pinned at most 3 per forum", () => {
    expect(STAFF_GUIDES.length).toBeGreaterThanOrEqual(30);
    const keys = new Set<string>();
    const titles = new Set<string>();
    const pins = new Map<string, number>();
    for (const g of STAFF_GUIDES) {
      expect({ key: g.key, problems: guideProblems(g) }).toEqual({ key: g.key, problems: [] });
      expect(isForumCategory(g.category)).toBe(true);
      expect(keys.has(g.key)).toBe(false);
      expect(titles.has(g.title)).toBe(false);
      keys.add(g.key);
      titles.add(g.title);
      expect(g.body).toMatch(/\*\*Sources\*\*/);
      if (g.pinned) pins.set(g.category, (pins.get(g.category) ?? 0) + 1);
      // No invented people: guides never quote members or tell "a contractor told us" stories.
      expect(g.body).not.toMatch(/\b(a (contractor|member|reader) (told|asked) us|one of our members)\b/i);
    }
    for (const n of pins.values()) expect(n).toBeLessThanOrEqual(MAX_PINS_PER_FORUM);
    expect(new Set(STAFF_GUIDES.map((g) => guideShortId(g.key))).size).toBe(STAFF_GUIDES.length);
  });

  it("match the SQL fallback file (same keys, short ids, ON CONFLICT DO NOTHING)", () => {
    const sql = buildStaffGuideSql(STAFF_GUIDES, { date: "2026-10-09" });
    if (process.env.UPDATE_GUIDE_SQL === "1") writeFileSync(SQL_PATH, sql);
    const onDisk = readFileSync(SQL_PATH, "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(sql);
    expect(sql.match(/on conflict \(auto_source_key\) where auto_source_key is not null do nothing;/g)).toHaveLength(STAFF_GUIDES.length);
    expect(sql).not.toMatch(/created_at\s*,\s*category_id|'20\d\d-\d\d-\d\dT/); // never a hard-coded (backdated) timestamp
    for (const g of STAFF_GUIDES) expect(sql).toContain(`'${GUIDE_KEY_PREFIX}${g.key}'`);
  });
});
