import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { contactsLeft, FREE_CONTACTS_PER_MONTH, monthStart, parseTickets, type talentProfileSchema } from "@/lib/talent/rules";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

type TalentForm = z.infer<typeof talentProfileSchema>;
export const talentAuthority = `EXISTS (SELECT 1 FROM users_profile u WHERE u.id=? AND u.status='active') AND ${customerAppAuthority}`;
export const approvedTalentEmployer = `EXISTS (
  SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
  JOIN users_profile u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=?
  AND o.profile_status='approved' AND o.status='active' AND u.status='active'
)`;

export async function beginVpsTalentContact(
  actor: { userId: string; orgId: string; pro: boolean }, handle: string,
  db: D1Binding = vpsAppDatabase(), now: Date = new Date(),
) {
  const person = await db.prepare(`SELECT t.user_id,t.handle,t.display_name,u.email
    FROM talent_profiles t JOIN users_profile u ON u.id=t.user_id WHERE t.handle=? AND t.published=1
    AND u.status='active' AND ${approvedTalentEmployer} AND ${customerAppAuthority}`)
    .bind(handle, actor.orgId, actor.userId)
    .first<{ user_id: string; handle: string; display_name: string; email: string | null }>();
  if (!person) return { status: "missing" } as const;
  if (person.user_id === actor.userId) return { status: "self" } as const;
  if (!person.email) return { status: "undeliverable" } as const;

  const since = monthStart(now);
  const id = randomUUID();
  const result = await db.batch<{ n?: number; id?: string }>([
    db.prepare(`INSERT INTO talent_contacts(id,talent_user_id,organization_id,sender_id,created_at)
      SELECT ?,p.user_id,?,?,? FROM talent_profiles p JOIN users_profile u ON u.id=p.user_id
      WHERE p.user_id=? AND p.handle=? AND p.published=1 AND u.status='active' AND u.email=?
      AND ${approvedTalentEmployer} AND ${customerAppAuthority}
      AND (?=1 OR (SELECT count(*) FROM talent_contacts c WHERE c.organization_id=? AND c.created_at>=?)<?)
      RETURNING id`).bind(id, actor.orgId, actor.userId, now.toISOString(), person.user_id, handle, person.email,
      actor.orgId, actor.userId, Number(actor.pro), actor.orgId, since, FREE_CONTACTS_PER_MONTH),
    db.prepare("SELECT count(*) AS n FROM talent_contacts WHERE organization_id=? AND created_at>=? AND " +
      approvedTalentEmployer + " AND " + customerAppAuthority).bind(actor.orgId, since, actor.orgId, actor.userId),
  ]);
  if (result.length !== 2 || result.some(item => !item.success)) throw new Error("Talent contact write failed");
  const used = result[1].results[0]?.n ?? 0;
  if (result[0].results[0]?.id !== id) {
    return { status: !actor.pro && used >= FREE_CONTACTS_PER_MONTH ? "limit" : "missing" } as const;
  }
  return { status: "recorded", person: { ...person, email: person.email }, left: contactsLeft(used, actor.pro) } as const;
}

export async function endorseVpsTalent(
  actor: { userId: string; orgId: string }, input: { handle: string; note: string }, db: D1Binding = vpsAppDatabase(),
) {
  const person = await db.prepare(`SELECT t.user_id FROM talent_profiles t JOIN users_profile u ON u.id=t.user_id
    WHERE t.handle=? AND t.published=1 AND u.status='active' AND ${approvedTalentEmployer} AND ${customerAppAuthority}`)
    .bind(input.handle, actor.orgId, actor.userId).first<{ user_id: string }>();
  if (!person) return "profileUnavailable";
  if (person.user_id === actor.userId) return "selfEndorse";
  const row = await db.prepare(`INSERT INTO talent_endorsements(id,talent_user_id,organization_id,endorsed_by,note)
    SELECT ?,t.user_id,?,?,? FROM talent_profiles t JOIN users_profile u ON u.id=t.user_id
    WHERE t.user_id=? AND t.handle=? AND t.published=1 AND u.status='active'
    AND ${approvedTalentEmployer} AND ${customerAppAuthority}
    AND (EXISTS (SELECT 1 FROM talent_contacts c WHERE c.talent_user_id=t.user_id AND c.organization_id=?)
      OR EXISTS (SELECT 1 FROM job_applications a JOIN job_posts j ON j.id=a.job_id
        WHERE j.organization_id=? AND a.email=u.email COLLATE NOCASE))
    ON CONFLICT(talent_user_id,organization_id) DO UPDATE SET note=excluded.note,endorsed_by=excluded.endorsed_by
    RETURNING id`).bind(randomUUID(), actor.orgId, actor.userId, input.note, person.user_id, input.handle,
    actor.orgId, actor.userId, actor.orgId, actor.orgId).first<{ id: string }>();
  return row ? "saved" : "endorseProof";
}

export async function saveVpsTalent(
  userId: string, handle: string, form: TalentForm, db: D1Binding = vpsAppDatabase(),
) {
  const tradeSlugs = [form.primaryTrade, ...form.otherTrades];
  const [trades, region, owner, handleOwner] = await Promise.all([
    db.prepare("SELECT id,slug FROM trade_categories WHERE slug IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(tradeSlugs)).all<{ id: string; slug: string }>(),
    db.prepare("SELECT id FROM regions WHERE slug=?").bind(form.region).first<{ id: string }>(),
    db.prepare(`SELECT ${talentAuthority} AS allowed`).bind(userId).first<{ allowed: number }>(),
    db.prepare("SELECT user_id FROM talent_profiles WHERE handle=?").bind(handle).first<{ user_id: string }>(),
  ]);
  if (owner?.allowed !== 1 || !trades.success) return "couldNotSave";
  if (handleOwner && handleOwner.user_id !== userId) return "handleTaken";
  const categories = new Map(trades.results.map(trade => [trade.slug, trade.id]));
  const primary = categories.get(form.primaryTrade);
  if (!primary) return "pickTrade";
  if (!region) return "pickRegion";
  const others = form.otherTrades.map(slug => categories.get(slug)).filter(id => id && id !== primary);
  const updated = new Date().toISOString();
  try {
    const results = await db.batch([
      db.prepare(`SELECT CASE WHEN ${talentAuthority} THEN 1 ELSE json('talent_account_unavailable') END`).bind(userId),
      db.prepare(`INSERT INTO talent_profiles(user_id,handle,display_name,headline,primary_trade_id,other_trade_ids,region_id,
        city,years_experience,certifications,availability,employment_types,pay_expectation,bio,published,contact_visible,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle,display_name=excluded.display_name,headline=excluded.headline,
          primary_trade_id=excluded.primary_trade_id,other_trade_ids=excluded.other_trade_ids,region_id=excluded.region_id,city=excluded.city,
          years_experience=excluded.years_experience,certifications=excluded.certifications,availability=excluded.availability,
          employment_types=excluded.employment_types,pay_expectation=excluded.pay_expectation,bio=excluded.bio,
          published=excluded.published,contact_visible=excluded.contact_visible,updated_at=excluded.updated_at`)
        .bind(userId, handle, form.displayName, form.headline || null, primary, JSON.stringify(others), region.id,
          form.city || null, form.yearsExperience ?? null, JSON.stringify(parseTickets(form.tickets)), form.availability,
          JSON.stringify(form.employmentTypes), form.payExpectation || null, form.bio || null, Number(form.published),
          Number(form.contactVisible), updated),
      db.prepare(`INSERT INTO talent_private(user_id,phone,updated_at) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at`)
        .bind(userId, form.phone || null, updated),
      db.prepare("UPDATE users_profile SET onboarding_completed=1,updated_at=? WHERE id=? AND onboarding_completed=0")
        .bind(updated, userId),
    ]);
    if (results.length === 4 && results.every(result => result.success)) return "saved";
  } catch {
    const current = await db.prepare("SELECT user_id FROM talent_profiles WHERE handle=?").bind(handle).first<{ user_id: string }>().catch(() => null);
    if (current && current.user_id !== userId) return "handleTaken";
  }
  return "couldNotSave";
}
