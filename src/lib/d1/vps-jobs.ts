import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { FREE_JOB_LIMIT, type applicationSchema, type jobSchema } from "@/lib/jobs/rules";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { D1Binding } from "./contracts";
import { vpsAppDatabase } from "./http-binding";

type Employer = { orgId: string; userId: string; pro: boolean };
const eligible = "o.status='active' AND o.profile_status='approved' AND o.is_demo=0";
const member = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  WHERE m.organization_id=o.id AND m.user_id=? AND u.status='active')`;

export async function createVpsJob(
  employer: Employer, form: z.infer<typeof jobSchema>, slug: string, today: string, expiry: string,
  db: D1Binding = vpsAppDatabase(),
) {
  const [trade, region] = await Promise.all([
    db.prepare("SELECT id FROM trade_categories WHERE slug=?").bind(form.category).first<{ id: string }>(),
    db.prepare("SELECT id FROM regions WHERE slug=?").bind(form.region).first<{ id: string }>(),
  ]);
  if (!trade) return "pickTrade";
  if (!region) return "pickRegion";
  const result = await db.prepare(`INSERT INTO job_posts
    (id,slug,organization_id,posted_by,title,category_id,region_id,city,employment_type,pay_min,pay_max,pay_unit,description,requirements,expires_at)
    SELECT ?,?,o.id,?,?,?,?,?,?,?,?,?,?,?,? FROM organizations o
    WHERE o.id=? AND ${eligible} AND ${member} AND ${customerAppAuthority}
    AND (?=1 OR (SELECT count(*) FROM job_posts j WHERE j.organization_id=o.id AND j.status='open' AND j.expires_at>=?)<?)
    RETURNING id`)
    .bind(randomUUID(), slug, employer.userId, form.title, trade.id, region.id, form.city, form.employmentType,
      form.payMin ?? null, form.payMax ?? null, form.payMin != null || form.payMax != null ? form.payUnit ?? "hour" : null,
      form.description, form.requirements || null, expiry, employer.orgId, employer.userId, Number(employer.pro), today, FREE_JOB_LIMIT)
    .first<{ id: string }>();
  return result ? "posted" : "freeLimitPost";
}

export async function updateVpsJob(
  employer: Employer, id: string, action: "close" | "renew", today: string, expiry: string,
  db: D1Binding = vpsAppDatabase(),
) {
  const scope = `j.id=? AND j.organization_id=? AND ${customerAppAuthority}
    AND EXISTS(SELECT 1 FROM organizations o WHERE o.id=j.organization_id AND ${eligible} AND ${member})`;
  const current = await db.prepare(`SELECT slug FROM job_posts j WHERE ${scope}`)
    .bind(id, employer.orgId, employer.userId).first<{ slug: string }>();
  if (!current) return { error: "notYours" as const };
  const update = await db.prepare(`UPDATE job_posts AS j
    SET status=?,expires_at=CASE WHEN ?='renew' THEN ? ELSE expires_at END,updated_at=?
    WHERE ${scope}
    AND (?='close' OR ?=1 OR (SELECT count(*) FROM job_posts other WHERE other.organization_id=j.organization_id
      AND other.id<>j.id AND other.status='open' AND other.expires_at>=?)<?)
    RETURNING slug`).bind(action === "close" ? "closed" : "open", action, expiry, new Date().toISOString(),
    id, employer.orgId, employer.userId, action, Number(employer.pro), today, FREE_JOB_LIMIT).first<{ slug: string }>();
  if (!update) return { error: action === "renew" ? "freeLimitRenew" as const : "couldNotUpdate" as const };
  return { slug: update.slug };
}

export async function applyVpsJob(
  form: z.infer<typeof applicationSchema>, today: string, db: D1Binding = vpsAppDatabase(),
) {
  const id = randomUUID();
  type Delivery = { title: string; slug: string; trade: string | null; recipient: string | null };
  const [, delivery] = await db.batch<Delivery>([
    db.prepare(`INSERT INTO job_applications(id,job_id,name,email,phone,experience_years,certifications,message)
      SELECT ?,j.id,?,?,?,?,?,? FROM job_posts j JOIN organizations o ON o.id=j.organization_id
      WHERE j.slug=? AND j.status='open' AND j.expires_at>=? AND ${eligible} AND ${customerAppAuthority}`)
      .bind(id, form.name, form.email, form.phone || null, form.experienceYears ?? null,
        form.certifications || null, form.message || null, form.slug, today),
    db.prepare(`SELECT j.title,j.slug,c.slug AS trade,coalesce(nullif(o.email,''),p.email) AS recipient
      FROM job_applications a JOIN job_posts j ON j.id=a.job_id JOIN organizations o ON o.id=j.organization_id
      LEFT JOIN trade_categories c ON c.id=j.category_id LEFT JOIN users_profile p ON p.id=j.posted_by WHERE a.id=?`).bind(id),
  ]);
  return delivery.results[0] ?? null;
}
