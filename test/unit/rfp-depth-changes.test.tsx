import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("@/i18n/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/components/leads/trial", () => ({ TrialStartForm: () => null, canStartTrial: () => true }));

// loadRfpChanges reads with the service role: a switch and a stand-in client.
const reader: { configured: boolean; result: { data: unknown; error: unknown }; seen: Record<string, unknown> } = { configured: true, result: { data: [], error: null }, seen: {} };
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => reader.configured, isSupabaseConfigured: () => reader.configured }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      reader.seen.table = table;
      const q: Record<string, unknown> = {
        select: (cols: string) => ((reader.seen.cols = cols), q),
        eq: (col: string, v: string) => ((reader.seen[col] = v), q),
        order: () => q,
        limit: (n: number) => ((reader.seen.limit = n), q),
        abortSignal: (s: AbortSignal) => ((reader.seen.signal = s), Promise.resolve(reader.result)),
      };
      return q;
    },
  }),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { TITLE_FLOOD_LIMIT, diffListing, loadRfpChanges, recordRfpChanges, titleKey, withoutTitleFlood, type PendingChange, type RfpChange } from "@/lib/rfp-detail/changes";
import { syncPublicSources, type Candidate, type Source } from "@/lib/tenders/sync";
import { ChangeLog } from "@/components/rfp-detail/change-log";
import { formatDate } from "@/i18n/format";

/**
 * The change log: what gets recorded when the importer re-reads a listing
 * (closing date, title, status only; only for rows it actually updated), and
 * how the page shows it.
 */
describe("what counts as a change", () => {
  it("a closing date moved from one real date to another", () => {
    expect(diffListing({ title: "Roof", deadline: "2026-10-18" }, { title: "Roof", deadline: "2026-10-25" })).toEqual([{ field: "closing_date", oldValue: "2026-10-18", newValue: "2026-10-25" }]);
    // Same day, a missing date on either side, or a timestamp of the same day: nothing.
    expect(diffListing({ title: "A", deadline: "2026-10-18" }, { title: "A", deadline: "2026-10-18" })).toEqual([]);
    expect(diffListing({ title: "A", deadline: "2026-10-18" }, { title: "A", deadline: null })).toEqual([]);
    expect(diffListing({ title: "A", deadline: null }, { title: "A", deadline: "2026-10-18" })).toEqual([]);
    expect(diffListing({ title: "A", deadline: "2026-10-18" }, { title: "A", deadline: "2026-10-18T00:00:00+00:00" })).toEqual([]);
  });

  it("a title with different words, not different spacing, capitals or punctuation", () => {
    expect(diffListing({ title: "Roof repair at Arena", deadline: null }, { title: "Roof replacement at Arena", deadline: null })).toEqual([
      { field: "title", oldValue: "Roof repair at Arena", newValue: "Roof replacement at Arena" },
    ]);
    expect(diffListing({ title: "Roof  repair, at ARENA", deadline: null }, { title: "roof repair at arena", deadline: null })).toEqual([]);
    expect(titleKey("  Café — Roof! ")).toBe("cafe roof");
  });

  it("a status change, only when both are known", () => {
    expect(diffListing({ title: "A", deadline: null, status: "published" }, { title: "A", deadline: null, status: "archived" })).toEqual([{ field: "status", oldValue: "published", newValue: "archived" }]);
    expect(diffListing({ title: "A", deadline: null, status: "published" }, { title: "A", deadline: null })).toEqual([]);
  });

  it("drops a source's title changes when there are too many to be real edits (our own title cleaning changed)", () => {
    const mk = (n: number, source: string, field: PendingChange["field"] = "title"): PendingChange[] =>
      Array.from({ length: n }, (_, i) => ({ rfpId: `${source}-${i}`, slug: `${source}-${i}`, sourceKey: source, field, oldValue: "a", newValue: "b" }));
    const kept = withoutTitleFlood([...mk(TITLE_FLOOD_LIMIT + 1, "seao"), ...mk(3, "toronto"), ...mk(TITLE_FLOOD_LIMIT + 5, "seao", "closing_date")]);
    expect(kept.filter((c) => c.sourceKey === "seao" && c.field === "title")).toHaveLength(0);
    expect(kept.filter((c) => c.sourceKey === "toronto")).toHaveLength(3);
    // Real date moves are kept however many there are.
    expect(kept.filter((c) => c.field === "closing_date")).toHaveLength(TITLE_FLOOD_LIMIT + 5);
  });
});

/* ---------------------------------------------------------------- recording through the importer */

interface Call {
  table: string;
  op: string;
  arg?: unknown;
}

/** A Supabase stand-in with just what syncPublicSources touches; records every write. */
function fakeDb(existing: Record<string, unknown>[], opts: { updateError?: (id: string) => boolean; changesError?: { code: string; message: string } } = {}) {
  const calls: Call[] = [];
  const rows = (table: string): unknown[] => (table === "rfp_posts" ? existing : table === "regions" ? [{ id: "region-on", slug: "ontario" }, { id: "region-ca", slug: "canada" }] : [{ id: "cat-1", slug: "roofing" }]);
  const db = {
    from(table: string) {
      return {
        select() {
          const q: Record<string, unknown> = {
            eq: () => q,
            order: () => q,
            range: () => Promise.resolve({ data: rows(table), error: null }),
            then: (f: (v: unknown) => unknown) => Promise.resolve({ data: rows(table), error: null }).then(f),
          };
          return q;
        },
        update(patch: unknown) {
          let id = "";
          const q: Record<string, unknown> = {
            eq: (col: string, v: string) => {
              if (col === "id") id = v;
              return q;
            },
            in: () => q,
            then: (f: (v: unknown) => unknown) => {
              calls.push({ table, op: "update", arg: { id, patch } });
              return Promise.resolve({ error: opts.updateError?.(id) ? { message: "boom" } : null }).then(f);
            },
          };
          return q;
        },
        insert(arg: unknown) {
          calls.push({ table, op: "insert", arg });
          return { select: () => Promise.resolve({ data: [], error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f) };
        },
        upsert(arg: unknown) {
          calls.push({ table, op: "upsert", arg });
          return Promise.resolve({ error: table === "rfp_changes" ? opts.changesError ?? null : null });
        },
      };
    },
  };
  return { db: db as unknown as Parameters<typeof syncPublicSources>[0], calls };
}

const URL_A = "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-161-1";
const URL_B = "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-161-2";
const existingRow = (o: Record<string, unknown> = {}) => ({
  id: "rfp-a",
  slug: "snow-clearing-cb-161-1",
  source_url: URL_A,
  status: "published",
  deadline: "2026-10-18",
  title: "Snow clearing",
  summary: "s",
  region_id: "region-on",
  ...o,
});
const candidate = (o: { title?: string; deadline?: string | null; url?: string } = {}): Candidate => ({
  insert: {
    title: o.title ?? "Snow clearing",
    slug: "snow-clearing-cb-161-1",
    summary: "s",
    scope: "s",
    requirements: null,
    province: "Ontario",
    deadline: o.deadline === undefined ? "2026-10-25" : o.deadline,
    submission_instructions: "x",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: o.url ?? URL_A,
    source_notes: "",
    status: "published",
    is_demo: false,
    published_at: "2026-10-01T00:00:00Z",
  },
  categories: [],
  regionSlug: "ontario",
});
const source = (cands: Candidate[]): Source => ({ key: "canadabuys", minMatchesToArchive: 1, collect: async () => cands });
const run = (db: ReturnType<typeof fakeDb>["db"], cands: Candidate[], dry = false) => syncPublicSources(db, [source(cands)], { today: "2026-10-22", dry });
const changeRows = (calls: Call[]) => calls.filter((c) => c.table === "rfp_changes").flatMap((c) => c.arg as Record<string, unknown>[]);

describe("the importer logs changes to listings it reads", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records a moved closing date, with the listing, both dates and the feed", async () => {
    const { db, calls } = fakeDb([existingRow()]);
    const { status, body } = await run(db, [candidate({ deadline: "2026-10-25" })]);
    expect(status).toBe(200);
    expect(changeRows(calls)).toEqual([
      { rfp_id: "rfp-a", slug: "snow-clearing-cb-161-1", field: "closing_date", old_value: "2026-10-18", new_value: "2026-10-25", source_key: "canadabuys" },
    ]);
    expect(body).toMatchObject({ refreshed: 1, logged: 1 });
  });

  it("records a changed title, and both together", async () => {
    const { db, calls } = fakeDb([existingRow()]);
    await run(db, [candidate({ title: "Snow clearing and sanding", deadline: "2026-10-30" })]);
    expect(changeRows(calls).map((r) => r.field).sort()).toEqual(["closing_date", "title"]);
  });

  it("records nothing for a listing that did not change, or only changed region", async () => {
    const same = fakeDb([existingRow({ deadline: "2026-10-25" })]);
    await run(same.db, [candidate({ deadline: "2026-10-25" })]);
    expect(same.calls.filter((c) => c.op === "update" || c.table === "rfp_changes")).toEqual([]);
    const region = fakeDb([existingRow({ deadline: "2026-10-25", region_id: "region-ca" })]);
    await run(region.db, [candidate({ deadline: "2026-10-25" })]);
    expect(region.calls.some((c) => c.op === "update")).toBe(true);
    expect(changeRows(region.calls)).toEqual([]);
  });

  it("records nothing for a new listing, and nothing when the row's update failed", async () => {
    const fresh = fakeDb([]);
    await run(fresh.db, [candidate()]);
    expect(changeRows(fresh.calls)).toEqual([]);
    const failed = fakeDb([existingRow()], { updateError: () => true });
    const { body } = await run(failed.db, [candidate({ deadline: "2026-10-25" })]);
    expect(changeRows(failed.calls)).toEqual([]);
    expect(body).toMatchObject({ refreshed: 0, logged: 0 });
  });

  it("records the status change when a listing leaves the buyer's feed", async () => {
    const gone = existingRow({ id: "rfp-b", slug: "other-cb-161-2", source_url: URL_B, deadline: "2026-10-30", title: "Other" });
    const { db, calls } = fakeDb([existingRow({ deadline: "2026-10-25" }), gone]);
    await run(db, [candidate({ deadline: "2026-10-25" })]);
    expect(changeRows(calls)).toEqual([{ rfp_id: "rfp-b", slug: "other-cb-161-2", field: "status", old_value: "published", new_value: "archived", source_key: "canadabuys" }]);
  });

  it("a dry run writes nothing and says how many it would log", async () => {
    const { db, calls } = fakeDb([existingRow()]);
    const { body } = await run(db, [candidate({ deadline: "2026-10-25" })], true);
    expect(calls).toEqual([]);
    expect(body).toMatchObject({ dry: true, wouldRefresh: 1, wouldLogChanges: 1 });
  });

  it("is safe to run twice: the same change is sent with the key the table de-duplicates on, and a missing table never fails the import", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, calls } = fakeDb([existingRow()], { changesError: { code: "42P01", message: 'relation "public.rfp_changes" does not exist' } });
    const { status, body } = await run(db, [candidate({ deadline: "2026-10-25" })]);
    expect(status).toBe(200);
    expect(body).toMatchObject({ refreshed: 1, logged: 0 });
    expect(calls.filter((c) => c.table === "rfp_changes")).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("migration 20261022000300"));
  });

  it("recordRfpChanges tolerates a throwing client", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = { from: () => { throw new Error("network down"); } } as unknown as Parameters<typeof recordRfpChanges>[0];
    const n = await recordRfpChanges(boom, [{ rfpId: "1", slug: "s", sourceKey: "k", field: "title", oldValue: "a", newValue: "b" }]);
    expect(n).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("reading a listing's log", () => {
  it("is one indexed read by slug, newest first, capped, with a timeout, and keeps only the three fields", async () => {
    reader.configured = true;
    reader.result = {
      data: [
        { field: "closing_date", old_value: "2026-10-18", new_value: "2026-10-25", changed_at: "2026-10-20T14:00:00Z" },
        { field: "summary", old_value: "a", new_value: "b", changed_at: "2026-10-19T14:00:00Z" },
        { field: "title", old_value: "Roof repair", new_value: "Roof replacement", changed_at: "2026-10-18T14:00:00Z" },
      ],
      error: null,
    };
    const rows = await loadRfpChanges("snow-clearing-cb-161-1");
    expect(rows.map((r) => r.field)).toEqual(["closing_date", "title"]);
    expect(rows[0]).toEqual({ field: "closing_date", oldValue: "2026-10-18", newValue: "2026-10-25", at: "2026-10-20T14:00:00Z" });
    expect(reader.seen).toMatchObject({ table: "rfp_changes", slug: "snow-clearing-cb-161-1", limit: 6 });
    expect(reader.seen.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows nothing, never an error, when the read fails, the table is missing or there is no service key", async () => {
    reader.configured = true;
    reader.result = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    expect(await loadRfpChanges("x")).toEqual([]);
    reader.result = { data: [], error: null };
    expect(await loadRfpChanges("x")).toEqual([]);
    reader.configured = false;
    expect(await loadRfpChanges("x")).toEqual([]);
    reader.configured = true;
  });
});

/* ---------------------------------------------------------------- the page */

describe("the change log on the page", () => {
  const change = (o: Partial<RfpChange>): RfpChange => ({ field: "closing_date", oldValue: "2026-10-18", newValue: "2026-10-25", at: "2026-10-20T14:00:00Z", ...o });

  const day = (d: string) => formatDate(d, "en", { month: "short", day: "numeric", year: "numeric" });

  it("says what changed, when, in plain words", () => {
    const html = renderToStaticMarkup(<ChangeLog changes={[change({})]} />);
    expect(html).toContain(`Updated ${day("2026-10-20")}: closing date moved from ${day("2026-10-18")} to ${day("2026-10-25")}.`);
    expect(day("2026-10-20")).toMatch(/Oct\.? 20, 2026/);
    expect(html).toContain('data-block="changes"');
    expect(html).toContain("Addenda are on the buyer&#x27;s official posting");
  });

  it("shows title and status changes, newest first as given", () => {
    const html = renderToStaticMarkup(
      <ChangeLog changes={[change({ field: "title", oldValue: "Roof repair", newValue: "Roof replacement", at: "2026-10-21T10:00:00Z" }), change({ field: "status", oldValue: "published", newValue: "archived", at: "2026-10-19T10:00:00Z" })]} />,
    );
    expect(html).toContain("title changed from “Roof repair” to “Roof replacement”");
    expect(html).toContain("no longer in the buyer&#x27;s feed");
    expect(html.indexOf(day("2026-10-21"))).toBeGreaterThan(-1);
    expect(html.indexOf(day("2026-10-21"))).toBeLessThan(html.indexOf(day("2026-10-19")));
  });

  it("renders nothing when there is nothing to say", () => {
    expect(renderToStaticMarkup(<ChangeLog changes={[]} />)).toBe("");
  });
});
