import "server-only";
import { randomUUID } from "node:crypto";
import type { D1Binding } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import type { RfpPostInput } from "@/lib/validations";
import type { Locale } from "@/i18n/config";
import { runPmJobAlerts } from "@/lib/pm-jobs/server";
import { pmJobAlertsEnabled } from "@/lib/pm-jobs/alerts";
import { sendAdminNewRfp } from "@/lib/email/send";
import type { TownPostFields } from "./post";
import type { FinishResult, TownPage } from "./server";
import { writeNativeTownNotifications } from "./native-sealed";

const member = `EXISTS(SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
  JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?
    AND u.status='active' AND u.primary_role='public_buyer' AND o.status='active' AND o.is_demo=0
    AND o.organization_type='public_buyer') AND ${customerAppAuthority}`;

export async function nativeTownPageFor(org: string, actor: string, db: D1Binding = vpsAppDatabase()): Promise<TownPage | null> {
  const page = await db.prepare(`SELECT buyer_key AS buyerKey,buyer_name AS buyerName,province_code AS provinceCode,1 AS verified
      FROM buyer_pages WHERE organization_id=? AND ${member}
    UNION ALL SELECT buyer_key,buyer_name,province_code,0 FROM
      (SELECT buyer_key,buyer_name,province_code FROM buyer_claims
      WHERE user_id=? AND status IN ('pending','verified') AND ${member} ORDER BY created_at DESC,id DESC LIMIT 1)
    ORDER BY verified DESC LIMIT 1`).bind(org,org,actor,actor,org,actor)
    .first<Omit<TownPage,"verified"> & { verified: number }>();
  return page ? {...page,verified:Boolean(page.verified)} : null;
}

export async function postNativeTown(
  actor: string, org: string, lang: Locale, slug: string, post: RfpPostInput, page: TownPage, fields: TownPostFields,
  effects: { postedBy: string | null; schedule: (task: () => Promise<void>) => void }, db: D1Binding = vpsAppDatabase(),
): Promise<(FinishResult & { id: string }) | null> {
  const categories = [...new Set(post.categories)];
  const id = randomUUID();
  const now = new Date().toISOString();
  const phase = page.verified ? "published" : "pending_review";
  const pageGate = page.verified
    ? "EXISTS(SELECT 1 FROM buyer_pages WHERE buyer_key=? AND buyer_name=? AND organization_id=?)"
    : "EXISTS(SELECT 1 FROM buyer_claims WHERE buyer_key=? AND buyer_name=? AND user_id=? AND status IN ('pending','verified'))";
  const result = await db.batch([
    db.prepare(`SELECT CASE WHEN ${member} AND ${pageGate}
      AND EXISTS(SELECT 1 FROM regions WHERE slug=?)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM property_types WHERE slug=?))
      AND (SELECT count(*) FROM trade_categories WHERE slug IN (SELECT value FROM json_each(?)))=? AND ?>0
      THEN 1 ELSE json('native_town_post_denied') END`).bind(org,actor,page.buyerKey,page.buyerName,page.verified ? org : actor,
        post.regionSlug,post.propertyType ?? null,post.propertyType ?? null,JSON.stringify(categories),categories.length,categories.length),
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,summary,scope,requirements,property_type_id,region_id,city,province,
      budget_min,budget_max,budget_public,deadline,submission_instructions,contact_visibility,contact_name,contact_email,contact_phone,
      posted_by_user_id,posted_by_organization_id,source_type,status,poster_lang,keep_alive_token,created_at,updated_at,published_at,
      buyer_key,buyer_name,post_kind,official_url,official_portal,question_deadline,sealed)
      VALUES(?,?,?,?,?,?,(SELECT id FROM property_types WHERE slug=?),(SELECT id FROM regions WHERE slug=?),?,?,?,?,?,?,?,?,?,?,?,?,
        ?,'public_buyer_direct',?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,post.title,slug,post.summary,post.scope,post.requirements || null,post.propertyType ?? null,post.regionSlug,post.city || null,
        post.province || null,post.budgetMin ?? null,post.budgetMax ?? null,Number(post.budgetPublic ?? false),post.deadline.toISOString().slice(0,10),
        post.submissionInstructions || null,post.contactVisibility,post.contactName || null,post.contactEmail || null,post.contactPhone || null,
        actor,org,phase,lang,randomUUID(),now,now,page.verified ? now : null,page.buyerKey,page.buyerName,fields.postKind,fields.officialUrl,
        fields.officialPortal,fields.questionDeadline,Number(fields.sealed)),
    ...categories.map((category) => db.prepare(`INSERT INTO rfp_categories(id,rfp_id,category_id)
      SELECT ?,?,id FROM trade_categories WHERE slug=?`).bind(randomUUID(),id,category)),
    db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
      VALUES(?,?,?,?,'posted',json_object('kind',?,'verified',?,'sealed',?))`)
      .bind(id,org,page.buyerKey,actor,fields.postKind,Number(page.verified),Number(fields.sealed)),
    db.prepare(`INSERT INTO town_job_log(rfp_id,organization_id,buyer_key,actor_user_id,event,detail)
      VALUES(?,?,?,?,?,json_object('verified',?,'auto',?,'followers',(SELECT count(*) FROM buyer_follows WHERE buyer_slug=?)))`)
      .bind(id,org,page.buyerKey,actor,page.verified ? "published" : "sent_to_review",Number(page.verified),Number(page.verified),page.buyerKey),
  ]);
  if (!result[1]?.success || result[1].meta.changes !== 1) return null;
  let alerts: FinishResult["alerts"] = "none";
  let wouldEmail = 0;
  if (page.verified) {
    const preview = await runPmJobAlerts(db,id,{dry:true}).catch(() => null);
    wouldEmail = preview?.wouldEmail ?? 0;
    if (!pmJobAlertsEnabled()) alerts = "off";
    else if (!process.env.BUSINESS_MAILING_ADDRESS?.trim()) alerts = "no_address";
    else if (wouldEmail) alerts = "on";
    const send = alerts === "on";
    effects.schedule(async () => {
      const followers = await db.prepare("SELECT DISTINCT user_id FROM buyer_follows WHERE buyer_slug=?")
        .bind(page.buyerKey).all<{user_id:string}>();
      await Promise.allSettled([
        writeNativeTownNotifications(followers.results.map(({user_id}) => ({user_id,type:"town_new_job",title:`New from ${page.buyerName}`.slice(0,200),
          message:post.title,link_url:`/rfps/${slug}`})),db),
        send ? runPmJobAlerts(db,id) : Promise.resolve(),
      ]);
    });
  }
  effects.schedule(async () => {
    const pending = page.verified ? null : await db.prepare("SELECT count(*) AS n FROM rfp_posts WHERE status='pending_review'").first<{n:number}>();
    await sendAdminNewRfp({ title:post.title,postedBy:effects.postedBy ?? page.buyerName,region:post.regionSlug,
      category:categories.join(", ") || null,kind:"public_buyer_direct",autoPublished:page.verified,pending:pending?.n ?? null }).catch(() => undefined);
  });
  return {id,status:phase,alerts,wouldEmail};
}
