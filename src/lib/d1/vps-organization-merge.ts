import { randomUUID } from "node:crypto";
import { MERGE_PLAN, pickPrimary, type MergeStep } from "@/lib/dedupe/merge";
import { orderedPair } from "@/lib/dedupe/review";
import { customerAppAuthority, UUID, type D1Binding } from "./contracts";
import { activeRequestAdmin } from "./customer-requests";
import { vpsAppDatabase } from "./http-binding";

const addedRelationships: MergeStep[] = [
  { table: "buyer_follows", column: "org_id", mode: "move" },
  { table: "bid_comparison_bids", column: "bidder_organization_id", mode: "move" },
  { table: "emergency_roster_entries", column: "primary_org_id", mode: "move" },
  { table: "emergency_roster_entries", column: "backup_org_id", mode: "move" },
  { table: "service_contracts", column: "vendor_organization_id", mode: "move" },
  { table: "vendor_certificates", column: "vendor_organization_id", mode: "move" },
  { table: "town_invites", column: "trade_organization_id", mode: "move_unique", key: ["rfp_id"] },
  { table: "town_job_questions", column: "asker_organization_id", mode: "move" },
  { table: "org_link_clicks", column: "org_id", mode: "move_unique", key: ["day"] },
  { table: "organization_risk", column: "organization_id", mode: "single" },
  { table: "organizations", column: "merged_into", mode: "move" },
];

// A merge of plain listings can keep its existing IDs for every customer row. Billing
// reconciliation and transfer of an already-issued private object require separate handling.
const protectedRelationships = [
  { table: "subscriptions", column: "organization_id", label: "Stripe subscriptions" },
  { table: "intel_access", column: "organization_id", label: "Intel billing" },
  { table: "trade_trials", column: "organization_id", label: "Trade Pro trials" },
  { table: "badge_rewards", column: "organization_id", label: "badge rewards" },
  { table: "buyer_claims", column: "organization_id", label: "buyer claims" },
  { table: "buyer_pages", column: "organization_id", label: "managed buyer pages" },
  { table: "bid_comparisons", column: "organization_id", label: "private bid comparisons" },
  { table: "emergency_rosters", column: "organization_id", label: "emergency rosters" },
  { table: "emergency_roster_invites", column: "organization_id", label: "roster invitations" },
  { table: "service_contracts", column: "organization_id", label: "private contracts" },
  { table: "vendor_certificates", column: "organization_id", label: "vendor certificates" },
  { table: "town_invites", column: "organization_id", label: "municipal invitations" },
  { table: "town_job_results", column: "organization_id", label: "municipal award results" },
  { table: "_town_sealed_quotes", column: "trade_organization_id", label: "sealed quotes" },
  { table: "_company_media", column: "organization_id", label: "company media" },
  { table: "_company_legacy_portfolio", column: "organization_id", label: "company portfolio" },
  { table: "_private_attachments", column: "organization_id", label: "private attachments" },
  { table: "_project_photo_uploads", column: "organization_id", label: "project photo uploads" },
] as const;

const appScope = `${customerAppAuthority} AND ${activeRequestAdmin}`;
const eligible = "status='active' AND organization_type IN ('trade_company','supplier') AND is_demo=0 AND merged_into IS NULL";

type Result = { state: "merged"; primary: string; duplicate: string; moved: number; retained: number } |
  { state: "protected"; records: string[] } | { state: "unavailable" };

export async function mergeVpsOrganizationPair(
  adminId: string, x: string, y: string, db: D1Binding = vpsAppDatabase(),
): Promise<Result> {
  if (!UUID.test(x) || !UUID.test(y) || x === y) return { state: "unavailable" };
  const candidates = await db.prepare(`SELECT id,name,created_at,updated_at FROM organizations WHERE id IN (?,?)
    AND ${eligible} AND ${appScope} ORDER BY created_at,id`).bind(x, y, adminId)
    .all<{ id: string; name: string; created_at: string; updated_at: string }>();
  if (!candidates.success || candidates.results.length !== 2) return { state: "unavailable" };
  const { primary, duplicate } = pickPrimary(candidates.results[0], candidates.results[1]);
  const schema = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all<{ name: string }>();
  if (!schema.success) return { state: "unavailable" };
  const tables = new Set(schema.results.map(r => r.name));
  const protectedChecks: { sql: string; label: string }[] = protectedRelationships.filter(r => tables.has(r.table)).map(({ table, column, label }) => ({
    sql: `EXISTS(SELECT 1 FROM ${table} WHERE ${column}=?)`, label,
  }));
  protectedChecks.push({ sql: `EXISTS(SELECT 1 FROM case_studies WHERE organization_id=?
    AND (json_array_length(photos)>0 OR hero_url IS NOT NULL))`, label: "project photos" });
  const blockers = await db.prepare(`SELECT ${protectedChecks.map(({sql}, i) => `${sql} AS blocked${i}`).join(",")}`)
    .bind(...protectedChecks.map(() => duplicate.id)).first<Record<string, number>>();
  if (!blockers) return { state: "unavailable" };
  const found = protectedChecks.flatMap(({ label }, i) => blockers[`blocked${i}`] ? [label] : []);
  if (found.length) return { state: "protected", records: found };

  const gated = db.prepare(`SELECT CASE WHEN ${appScope}
    AND EXISTS(SELECT 1 FROM organizations WHERE id=? AND updated_at=? AND ${eligible})
    AND EXISTS(SELECT 1 FROM organizations WHERE id=? AND updated_at=? AND ${eligible})
    AND ${protectedChecks.map(({sql}) => `NOT ${sql}`).join(" AND ")}
    THEN 1 ELSE json('organization_merge_changed') END`).bind(adminId, primary.id, primary.updated_at, duplicate.id, duplicate.updated_at,
      ...protectedChecks.map(() => duplicate.id));
  const moveMembers = db.prepare(`UPDATE organization_members AS m SET organization_id=?,
    role=CASE WHEN m.role='owner' AND (EXISTS(SELECT 1 FROM organization_members p WHERE p.organization_id=? AND p.role='owner')
      OR m.id<>(SELECT d.id FROM organization_members d WHERE d.organization_id=m.organization_id AND d.role='owner'
        AND NOT EXISTS(SELECT 1 FROM organization_members p WHERE p.organization_id=? AND p.user_id=d.user_id)
        ORDER BY d.created_at,d.id LIMIT 1)) THEN 'admin' ELSE m.role END
    WHERE m.organization_id=? AND NOT EXISTS(SELECT 1 FROM organization_members p WHERE p.organization_id=? AND p.user_id=m.user_id)`)
    .bind(primary.id, primary.id, primary.id, duplicate.id, primary.id);
  const moves = [...MERGE_PLAN, ...addedRelationships]
    .filter(({ table, column }) => tables.has(table) && !protectedRelationships.some(row => row.table === table && row.column === column))
    .map((step) => {
      const { table, column } = step;
      // Keep duplicate equivalents on the archived listing, which preserves their audit trail.
      const equivalent = step.mode === "move" ? "" : `AND NOT EXISTS(SELECT 1 FROM ${table} p WHERE p.${column}=?
        ${step.mode === "move_unique" ? step.key.map(key => `AND p.${key} IS d.${key}`).join(" ") : ""})`;
      const sql = `UPDATE ${table} AS d SET ${column}=? WHERE d.${column}=? ${equivalent}`;
      return { step, statement: db.prepare(sql).bind(primary.id, duplicate.id, ...(equivalent ? [primary.id] : [])) };
    });
  const now = new Date().toISOString();
  const [a, b] = orderedPair(primary.id, duplicate.id);
  const archived = db.prepare(`UPDATE organizations SET status='deleted',profile_status='suspended',featured=0,merged_into=?,updated_at=?
    WHERE id=?`).bind(primary.id, now, duplicate.id);
  const kept = ["organization_members", ...moves.map(({ step }) => `${step.table}:${step.column}`)]
    .map((item) => {
      const [table, column = "organization_id"] = item.split(":");
      return `(SELECT count(*) FROM ${table} WHERE ${column}=?)`;
    }).join(" + ");
  const statements = [gated, moveMembers, ...moves.map(x => x.statement),
    db.prepare(`UPDATE organizations SET risk_flagged=max(risk_flagged,coalesce((SELECT risk_flagged FROM organizations WHERE id=?),0)),
      updated_at=? WHERE id=?`).bind(duplicate.id, now, primary.id),
    archived,
    db.prepare(`INSERT INTO duplicate_reviews(id,kind,a_id,b_id,status,source,note,resolved_by,resolved_at)
      VALUES(?,'company',?,?,'merged','admin',?,?,?) ON CONFLICT(kind,a_id,b_id) DO UPDATE SET
      status='merged',source='admin',note=excluded.note,resolved_by=excluded.resolved_by,resolved_at=excluded.resolved_at`)
      .bind(randomUUID(), a, b, `Merged "${duplicate.name}" into "${primary.name}".`, adminId, now),
    db.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(?,?,'organization.merge','organization',?,?)`).bind(randomUUID(), adminId, primary.id, JSON.stringify({
      primary: primary.id, primaryName: primary.name, duplicate: duplicate.id, duplicateName: duplicate.name,
    })),
    db.prepare(`SELECT ${kept} AS total`).bind(...Array(moves.length + 1).fill(duplicate.id)),
  ];
  const result = await db.batch<{ total: number }>(statements);
  if (result.length !== statements.length || result.some(row => !row.success)) return { state: "unavailable" };
  return { state: "merged", primary: primary.name, duplicate: duplicate.name,
    moved: result.slice(1, 2 + moves.length).reduce((total, row) => total + (row.meta.changes ?? 0), 0),
    retained: result.at(-1)?.results[0]?.total ?? 0 };
}
