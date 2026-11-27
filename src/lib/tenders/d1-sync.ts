import { randomUUID } from "node:crypto";
import { D1ApiError, type D1Binding, type D1Statement } from "@/lib/d1/contracts";
import { torontoDay } from "@/lib/attribution/cookie";
import type { PendingChange } from "@/lib/rfp-detail/changes";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { TenderInsert } from "./canadabuys";
import { publicTenderSource } from "./sources";
import type { ExistingRow } from "./sync";

type Taxon = { id: string; slug: string };
export type TenderUpdate = {
  prior: ExistingRow;
  patch: { title: string; deadline: string | null; summary?: string; scope?: string; region_id?: string };
  changes: PendingChange[];
};
export type NewTender = TenderInsert & { region_id: string | null };

export async function readD1TenderSync(db: D1Binding) {
  const [gate, cats, regions] = await db.batch<Taxon>([
    authority(db),
    db.prepare("SELECT id,slug FROM trade_categories"),
    db.prepare("SELECT id,slug FROM regions"),
  ]);
  if (!gate?.success || !cats?.success || !regions?.success) throw new D1ApiError(503, "tender_database_unavailable");
  const existing: ExistingRow[] = [];
  let after = "";
  for (;;) {
    const result = await db.prepare(`SELECT id,slug,source_url,status,deadline,title,summary,region_id,updated_at
      FROM rfp_posts WHERE source_type='public_source' AND is_demo=0 AND id>? AND ${customerAppAuthority}
      ORDER BY id LIMIT 500`).bind(after).all<ExistingRow>();
    if (!result.success) throw new D1ApiError(503, "tender_database_unavailable");
    existing.push(...result.results);
    if (result.results.length < 500) break;
    after = result.results[result.results.length - 1].id;
  }
  return [cats.results, regions.results, existing] as const;
}

function authority(db: D1Binding) {
  return db.prepare(`SELECT CASE WHEN ${customerAppAuthority} THEN 1 ELSE json('tender_database_unavailable') END`);
}

const unchanged = "id=? AND updated_at IS ? AND source_type='public_source' AND is_demo=0 AND status='published'";

export async function writeD1TenderSync(
  db: D1Binding, updates: TenderUpdate[], inserts: NewTender[], archiveRows: ExistingRow[],
  categories: Map<string, string[]>, changes: PendingChange[],
) {
  const now = new Date();
  const timestamp = now.toISOString();
  const day = torontoDay(now);
  const edits = new Map<string, PendingChange[]>();
  for (const change of changes) {
    const existing = edits.get(change.rfpId);
    if (existing) existing.push(change);
    else edits.set(change.rfpId, [change]);
  }
  type Count = "inserted" | "refreshed" | "archived" | "logged";
  const counts = { inserted: 0, refreshed: 0, archived: 0, logged: 0 };
  const queue: { statement: D1Statement; count?: Count }[] = [];
  function record(change: PendingChange, prior: ExistingRow) {
    queue.push({ count: "logged", statement: db.prepare(`INSERT INTO rfp_changes
      (id,rfp_id,slug,field,old_value,new_value,source_key,change_day,changed_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rfp_posts WHERE ${unchanged})
      ON CONFLICT(rfp_id,field,old_value,new_value,change_day) DO NOTHING`)
      .bind(randomUUID(), change.rfpId, change.slug, change.field, change.oldValue, change.newValue,
        change.sourceKey, day, timestamp, prior.id, prior.updated_at ?? null) });
  }
  async function flush() {
    if (!queue.length) return;
    const results = await db.batch([authority(db), ...queue.map(operation => operation.statement)]);
    if (results.length !== queue.length + 1 || results.some(result => !result.success)) {
      throw new D1ApiError(503, "tender_write_failed");
    }
    queue.forEach(({ count }, index) => {
      if (count) counts[count] += results[index + 1].meta.changes ?? 0;
    });
    queue.length = 0;
  }
  for (const { prior, patch } of updates) {
    for (const change of edits.get(prior.id) ?? []) record(change, prior);
    queue.push({ count: "refreshed", statement: db.prepare(`UPDATE rfp_posts
      SET title=?,deadline=?,summary=COALESCE(?,summary),scope=COALESCE(?,scope),
      region_id=COALESCE(?,region_id),updated_at=? WHERE ${unchanged}`)
      .bind(patch.title, patch.deadline, patch.summary ?? null, patch.scope ?? null, patch.region_id ?? null,
        timestamp, prior.id, prior.updated_at ?? null) });
    if (queue.length >= 16) await flush();
  }
  for (const r of inserts) {
    const id = randomUUID();
    queue.push({ count: "inserted", statement: db.prepare(`INSERT INTO rfp_posts
      (id,title,slug,summary,scope,requirements,province,region_id,deadline,submission_instructions,contact_name,
        contact_email,contact_phone,contact_visibility,source_type,source_url,source_notes,status,published_at,keep_alive_token)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'public_source',?,?,'published',?,?) ON CONFLICT(slug) DO NOTHING`)
      .bind(id, r.title, r.slug, r.summary, r.scope, r.requirements, r.province, r.region_id, r.deadline,
        r.submission_instructions, r.contact_name, r.contact_email, r.contact_phone, r.contact_visibility, r.source_url,
        r.source_notes, r.published_at, randomUUID()) },
    { statement: db.prepare(`INSERT INTO rfp_categories(id,rfp_id,category_id)
      SELECT json_extract(value,'$.id'),?,json_extract(value,'$.category') FROM json_each(?)
      WHERE EXISTS (SELECT 1 FROM rfp_posts WHERE id=?) ON CONFLICT(rfp_id,category_id) DO NOTHING`)
      .bind(id, JSON.stringify((categories.get(r.source_url) ?? []).map(category => ({ id: randomUUID(), category }))), id) });
    if (queue.length >= 16) await flush();
  }
  for (const r of archiveRows) {
    record({ rfpId: r.id, slug: r.slug, sourceKey: publicTenderSource(r.slug).key,
      field: "status", oldValue: "published", newValue: "archived" }, r);
    queue.push({ count: "archived", statement: db.prepare(`UPDATE rfp_posts SET status='archived',closed_at=?,updated_at=?
      WHERE ${unchanged}`).bind(timestamp, timestamp, r.id, r.updated_at ?? null) });
    if (queue.length >= 16) await flush();
  }
  await flush();
  return counts;
}
