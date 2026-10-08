import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AUTO_LABEL_EN,
  AUTO_LABEL_FR,
  PROMPTS,
  autoThreadsEnabled,
  buildAutoThread,
  categoryFor,
  isOutOfScope,
  planAutoThreads,
  type AutoSourceRecord,
} from "@/lib/forum/auto-threads";
import { runAutoThreads, threadRow } from "@/lib/forum/auto-threads-server";
import { isIndexableThread } from "@/lib/forum/rules";
import type { SupabaseClient } from "@supabase/supabase-js";

function rec(over: Partial<AutoSourceRecord> = {}): AutoSourceRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "roof-replacement-at-depot-ws1234567",
    title: "Roof replacement at maintenance depot",
    summary: "Remove and replace 2,000 m² of modified bitumen roofing.",
    city: "Ottawa",
    province: "Ontario",
    deadline: "2026-10-30",
    publishedAt: "2026-09-15T00:00:00Z",
    createdAt: "2026-09-16T08:00:00Z",
    sourceType: "public_source",
    isDemo: false,
    status: "published",
    tradeSlugs: ["roofing"],
    tradeNames: ["Roofing"],
    ...over,
  };
}

describe("auto-thread mapping", () => {
  it("maps trades to their forum, GC as a fallback", () => {
    expect(categoryFor(rec()).category).toBe("roofing-envelope");
    expect(categoryFor(rec({ tradeSlugs: ["general-contracting", "plumbing"] })).category).toBe("plumbing");
    expect(categoryFor(rec({ tradeSlugs: ["general-contracting"] }))).toEqual({ category: "general-contractors", priority: 1 });
    expect(categoryFor(rec({ tradeSlugs: [] }))).toEqual({ category: "general-contractors", priority: 2 });
  });

  it("posts SEAO items into the Québec forum, in French", () => {
    const d = buildAutoThread(rec({ slug: "toiture-ecole-qc-abc123", city: "Montréal", province: "Quebec" }))!;
    expect(d.category).toBe("quebec");
    expect(d.lang).toBe("fr");
    expect(d.title.startsWith("Appel d'offres :")).toBe(true);
    expect(d.body).toContain(AUTO_LABEL_FR);
    expect(d.body).toContain(PROMPTS.fr.tender);
    expect(d.body).toContain("/fr/rfps/toiture-ecole-qc-abc123");
  });

  it("labels awards and uses the award prompt + licence line", () => {
    const d = buildAutoThread(
      rec({ slug: "hvac-upgrade-city-hall-tora-99", sourceType: "public_source", summary: "Awarded September 2, 2026 to Acme Mechanical — $120,000 CAD.", deadline: "2026-09-02", publishedAt: "2026-09-02T00:00:00Z", tradeSlugs: ["hvac"], tradeNames: ["HVAC"] }),
    )!;
    expect(d.kind).toBe("award");
    expect(d.category).toBe("hvac-mechanical");
    expect(d.title.startsWith("Awarded:")).toBe(true);
    expect(d.body).toContain("Open Government Licence – Toronto");
    expect(d.body).toContain("Acme Mechanical");
    expect(d.body).toContain(PROMPTS.en.award);
  });

  it("skips out-of-scope, demo and unpublished records", () => {
    expect(isOutOfScope({ title: "Dredging of harbour channel", summary: null })).toBe(true);
    expect(isOutOfScope({ title: "Software licence renewal", summary: null })).toBe(true);
    expect(buildAutoThread(rec({ title: "Culvert replacement on Route 7" }))).toBeNull();
    expect(buildAutoThread(rec({ isDemo: true }))).toBeNull();
    expect(buildAutoThread(rec({ status: "archived" }))).toBeNull();
  });

  it("flag defaults on, off with FORUM_AUTO_THREADS=0", () => {
    expect(autoThreadsEnabled({})).toBe(true);
    expect(autoThreadsEnabled({ FORUM_AUTO_THREADS: "1" })).toBe(true);
    expect(autoThreadsEnabled({ FORUM_AUTO_THREADS: "0" })).toBe(false);
  });
});

describe("auto-thread honesty", () => {
  it("dates the thread on the real event date, never now", () => {
    const d = buildAutoThread(rec())!;
    expect(d.createdAt).toBe("2026-09-15T00:00:00.000Z");
    const row = threadRow(d, "cat", "sys", "abcdef12");
    expect(row.created_at).toBe(d.createdAt);
    expect(row.last_post_at).toBe(d.createdAt);
    expect(row.updated_at).toBe(d.createdAt);
    // Falls back to created_at only when published_at is missing.
    expect(buildAutoThread(rec({ publishedAt: null }))!.createdAt).toBe("2026-09-16T08:00:00.000Z");
  });

  it("body = label + record fields + one neutral prompt, nothing invented", () => {
    const d = buildAutoThread(rec())!;
    expect(d.body.startsWith(`**${AUTO_LABEL_EN}**`)).toBe(true);
    expect(d.title).toBe("Tender: Roof replacement at maintenance depot");
    expect(d.body).toContain("Remove and replace 2,000 m² of modified bitumen roofing.");
    expect(d.body).toContain("Ottawa, Ontario");
    expect(d.body).toContain("Roofing");
    expect(d.body).toContain("Open Government Licence – Canada");
    expect(d.body).toContain("/rfps/roof-replacement-at-depot-ws1234567");
    const prompts = [...Object.values(PROMPTS.en), ...Object.values(PROMPTS.fr)];
    const used = new Set(prompts.filter((p) => d.body.includes(p)));
    expect(used.size).toBe(1);
    expect(d.body.split(/\n\n/).at(-1)).toBe(PROMPTS.en.tender);
  });

  it("stays noindex until a member replies", () => {
    const base = { status: "approved" as const, type: "discussion" as const, wordsTotal: 400, auto: true };
    expect(isIndexableThread({ ...base, replyCount: 0 })).toBe(false);
    expect(isIndexableThread({ ...base, replyCount: 2 })).toBe(true);
  });
});

describe("auto-thread idempotency", () => {
  it("never plans a record twice (existing keys and duplicates)", () => {
    const a = rec();
    const b = rec({ id: "22222222-2222-2222-2222-222222222222", slug: "paint-ws9" , tradeSlugs: ["painting"], tradeNames: ["Painting"] });
    expect(planAutoThreads([a, a, b], new Set(), 10)).toHaveLength(2);
    expect(planAutoThreads([a, b], new Set([`rfp:${a.id}`]), 10).map((d) => d.sourceKey)).toEqual([`rfp:${b.id}`]);
  });

  it("puts trade forums first and respects the cap", () => {
    const gc = rec({ id: "33333333-3333-3333-3333-333333333333", tradeSlugs: [], publishedAt: "2026-10-01T00:00:00Z" });
    const out = planAutoThreads([gc, rec()], new Set(), 1);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("roofing-envelope");
  });

  it("writes only forum_threads (no posts, ratings, votes, reputation), and a re-run creates nothing", async () => {
    const inserts: { table: string; row: unknown }[] = [];
    const threads: { auto_source_key: string }[] = [];
    const tables: Record<string, unknown[]> = {
      rfp_posts: [{ id: rec().id, slug: rec().slug, title: rec().title, summary: rec().summary, city: "Ottawa", province: "Ontario", deadline: "2026-10-30", published_at: "2026-09-15T00:00:00Z", created_at: "2026-09-16T08:00:00Z", source_type: "public_source", is_demo: false, status: "published" }],
      trade_categories: [{ id: "c1", slug: "roofing", name: "Roofing" }],
      rfp_categories: [{ rfp_id: rec().id, category_id: "c1" }],
      forum_categories: [{ id: "f1", slug: "roofing-envelope" }],
      forum_profiles: [{ user_id: "sys" }],
    };
    const db = {
      auth: { admin: {} },
      from(table: string) {
        const rows = () => (table === "forum_threads" ? threads : tables[table] ?? []);
        const q: Record<string, unknown> = {};
        const chain = () => q;
        for (const m of ["select", "eq", "gte", "order", "in", "not", "limit", "range", "update", "upsert"]) q[m] = chain;
        q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
        q.insert = async (row: { auto_source_key: string }) => {
          inserts.push({ table, row });
          if (table === "forum_threads") threads.push(row);
          return { error: null };
        };
        q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res);
        return q;
      },
    } as unknown as SupabaseClient;

    const dry = await runAutoThreads(db, { days: 90, cap: 400, dry: true, now: new Date("2026-10-08") });
    expect(dry.planned).toBe(1);
    expect(inserts).toHaveLength(0);

    const first = await runAutoThreads(db, { days: 90, cap: 400, dry: false, now: new Date("2026-10-08") });
    expect(first.created).toBe(1);
    expect(inserts.map((i) => i.table)).toEqual(["forum_threads"]);
    expect((inserts[0].row as { created_at: string }).created_at).toBe("2026-09-15T00:00:00.000Z");

    const again = await runAutoThreads(db, { days: 90, cap: 400, dry: false, now: new Date("2026-10-08") });
    expect(again.created).toBe(0);
    expect(inserts).toHaveLength(1);
  });
});
