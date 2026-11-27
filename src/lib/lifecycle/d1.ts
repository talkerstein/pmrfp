import "server-only";
import { UUID, type D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase, vpsDatabase } from "@/lib/d1/http-binding";
import { chunk, type Db, type SelectError } from "@/lib/supabase/select-in";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

export type LifecycleDb = Db | { app: D1Binding; auth: D1Binding };
export const isD1Lifecycle = (db: LifecycleDb): db is { app: D1Binding; auth: D1Binding } => "app" in db && "auth" in db;
export const useD1Lifecycle = () => process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1";
export const nativeLifecycleDb = () => ({ app: vpsAppDatabase(), auth: vpsDatabase("auth") });

type Value = string | number | null;
type Read = PromiseLike<{ data: unknown; error: SelectError | null }>;
export interface LifecycleRead<T> { rows: T[]; error: SelectError | null }
export const inList = "IN (SELECT value FROM json_each(?))";

export async function readD1<T>(db: D1Binding, sql: string, ...params: Value[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  if (!result.success) throw new Error("D1 lifecycle query failed");
  return result.results;
}

export async function readD1ByIds<T>(db: D1Binding, ids: string[], sql: string, ...params: Value[]): Promise<T[]> {
  const rows: T[] = [];
  for (const group of chunk([...new Set(ids)])) {
    rows.push(...await readD1<T>(db, sql, JSON.stringify(group), ...params));
  }
  return rows;
}

export async function readLifecycle<T>(db: LifecycleDb, sql: string, params: Value[], legacy: (db: Db) => Read): Promise<LifecycleRead<T>> {
  if (!isD1Lifecycle(db)) {
    const { data, error } = await legacy(db);
    return { rows: (data ?? []) as T[], error };
  }
  try {
    return { rows: await readD1<T>(db.app, sql, ...params), error: null };
  } catch {
    return { rows: [], error: { message: "D1 lifecycle query unavailable" } };
  }
}

const gate = (db: D1Binding) => db.prepare(
  `SELECT CASE WHEN ${customerAppAuthority} THEN 1 ELSE json('lifecycle_authority_unavailable') END`,
);

export async function requireD1LifecycleAuthority(db: D1Binding) {
  if (!(await gate(db).first())) throw new Error("D1 lifecycle authority unavailable");
}

interface DeliveryClaim {
  userId: string;
  orgId: string | null;
  step: string;
  lang: string;
  to: string;
}
type ClaimWindow = { now: string; todayStart: string; last24: string; maxPerDay: number };

export async function claimD1Lifecycle(db: D1Binding, p: DeliveryClaim, window: ClaimWindow) {
  const [, claim] = await db.batch<{ id: string }>([
    gate(db),
    db.prepare(`INSERT INTO lifecycle_sends(id,user_id,organization_id,step,status,lang,sent_at)
      SELECT ?,u.id,?,?,'sending',?,? FROM users_profile u
      LEFT JOIN notification_preferences n ON n.user_id=u.id
      WHERE u.id=? AND u.email=? AND u.status='active' AND u.primary_role NOT IN ('admin','super_admin')
        AND coalesce(n.lifecycle_emails,1)=1 AND coalesce(n.channel_email,1)=1
        AND coalesce(n.new_rfps,'daily')<>'off'
        AND NOT EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=lower(trim(u.email)))
        AND NOT EXISTS(SELECT 1 FROM digest_subscribers WHERE email_key=lower(trim(u.email))
          AND (status IN ('bounced','unsubscribed') OR julianday(last_sent_at)>=julianday(?)))
        AND NOT EXISTS(SELECT 1 FROM lifecycle_sends WHERE user_id=u.id AND status IN ('sending','sent')
          AND julianday(sent_at)>=julianday(?))
        AND (SELECT count(*) FROM lifecycle_sends WHERE status IN ('sending','sent','failed')
          AND julianday(sent_at)>=julianday(?))<?
        AND ((? IS NULL AND u.primary_role='trade' AND
              (u.onboarding_completed=0 OR NOT EXISTS(SELECT 1 FROM organization_members WHERE user_id=u.id)))
          OR EXISTS(SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
            WHERE m.user_id=u.id AND o.id=? AND o.organization_type='trade_company' AND o.status='active'
              AND o.is_demo=0 AND o.profile_status NOT IN ('rejected','suspended')
              AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id
                AND s.status IN ('active','comped')
                AND (s.tier IN ('pro','featured') OR s.stripe_subscription_id GLOB 'lifetime_*'))))
      ON CONFLICT(user_id,step) DO NOTHING RETURNING id`).bind(
      crypto.randomUUID(), p.orgId, p.step, p.lang, window.now, p.userId, p.to,
      window.todayStart, window.todayStart, window.last24, window.maxPerDay, p.orgId, p.orgId,
    ),
  ]);
  if (!claim?.success) throw new Error("D1 lifecycle claim unavailable");
  return claim.results[0]?.id ?? null;
}

export async function finishD1Lifecycle(
  db: D1Binding,
  id: string,
  to: string,
  result: { ok: boolean; error?: string; invalidRecipient?: boolean; id: string | null },
) {
  const writes = [
    gate(db),
    db.prepare(`UPDATE lifecycle_sends SET status=?,resend_id=?,detail=? WHERE id=? AND status='sending'`)
      .bind(result.ok ? "sent" : "failed", result.id, result.ok ? null : (result.error ?? "send failed").slice(0, 300), id),
  ];
  if (result.invalidRecipient) {
    const email = to.trim().toLowerCase();
    writes.push(
      db.prepare(`INSERT INTO email_suppressions(email_key,reason,detail)
        VALUES(?,'bounce','Hostinger SMTP rejected the recipient address') ON CONFLICT(email_key) DO NOTHING`).bind(email),
      db.prepare(`UPDATE digest_subscribers SET status='bounced',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE email_key=? AND status<>'unsubscribed'`).bind(email),
    );
  }
  const results = await db.batch(writes);
  if (results.some(row => !row.success) || results[1]?.meta.changes !== 1) throw new Error("D1 lifecycle receipt unavailable");
}

export async function recordD1LifecycleSkips(db: D1Binding, userId: string, orgId: string, lang: string, skips: { step: string; reason: string }[]) {
  const results = await db.batch([
    gate(db),
    ...skips.map(skip => db.prepare(`INSERT INTO lifecycle_sends(id,user_id,organization_id,step,status,detail,lang)
      VALUES(?,?,?,?,'skipped',?,?) ON CONFLICT(user_id,step) DO NOTHING`).bind(
      crypto.randomUUID(), userId, orgId, skip.step, skip.reason, lang,
    )),
  ]);
  if (results.some(row => !row.success)) throw new Error("D1 lifecycle skips unavailable");
}

export async function unsubscribeD1Lifecycle(db: D1Binding, userId: string, legacyDigest?: string) {
  if (!UUID.test(userId)) return false;
  const proof = legacyDigest
    ? "AND EXISTS (SELECT 1 FROM _legacy_lifecycle_unsubscribe WHERE user_id=users_profile.id AND token_sha256=?)"
    : "";
  const [, result] = await db.batch([
    gate(db),
    db.prepare(`INSERT INTO notification_preferences(user_id,lifecycle_emails)
      SELECT id,0 FROM users_profile WHERE id=? ${proof}
      ON CONFLICT(user_id) DO UPDATE SET lifecycle_emails=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(...(legacyDigest ? [userId, legacyDigest] : [userId])),
  ]);
  return result?.success === true && result.meta.changes === 1;
}
