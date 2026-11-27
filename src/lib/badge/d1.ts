import "server-only";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { inList, readD1, readD1ByIds } from "@/lib/lifecycle/d1";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { INSTALL_KINDS, type BadgeHitRow, type BadgeInstall } from "./install";
import { REWARD_DAYS, REWARD_SOURCE, type TrialChange, type TrialRowLite } from "./reward";

export interface BadgeMember {
  id: string;
  email: string;
  primary_role: string;
  organization_id: string;
}

export async function readNativeBadgeHits(slugs?: string[]) {
  const db = vpsAppDatabase();
  const kinds = JSON.stringify(INSTALL_KINDS);
  const columns = "SELECT day,kind,slug,referrer FROM badge_hits WHERE referrer<>''";
  if (slugs) return readD1ByIds<BadgeHitRow>(db, slugs,
    `${columns} AND slug ${inList} AND kind ${inList} ORDER BY day,slug,referrer,kind LIMIT 5000`, kinds);
  const hits: BadgeHitRow[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const page = await readD1<BadgeHitRow>(db, `${columns} AND kind ${inList}
      ORDER BY day,slug,referrer,kind LIMIT 1000 OFFSET ?`, kinds, offset);
    hits.push(...page);
    if (page.length < 1000) break;
  }
  return hits;
}

export async function writeNativeBadgeHits(rows: { day: string; kind: string; slug: string; referrer: string; n: number }[]) {
  const result = await vpsAppDatabase().prepare(`INSERT INTO badge_hits(day,kind,slug,referrer,hits)
    SELECT json_extract(value,'$.day'),json_extract(value,'$.kind'),json_extract(value,'$.slug'),
      json_extract(value,'$.referrer'),json_extract(value,'$.n') FROM json_each(?) WHERE ${customerAppAuthority}
    ON CONFLICT(day,kind,slug,referrer) DO UPDATE SET hits=badge_hits.hits+excluded.hits`)
    .bind(JSON.stringify(rows)).run();
  if (!result.success || result.meta.changes !== rows.length) throw new Error("D1 badge hit write unavailable");
}

export async function applyNativeBadgeReward(
  org: { id: string; website: string | null; slug: string },
  install: BadgeInstall,
  change: TrialChange,
  before: TrialRowLite | null,
  after: TrialRowLite,
  now: Date,
  members: BadgeMember[],
) {
  const db = vpsAppDatabase();
  const trialStillCurrent = before
    ? "EXISTS (SELECT 1 FROM trade_trials WHERE organization_id=o.id AND started_at=? AND ends_at=?)"
    : "NOT EXISTS (SELECT 1 FROM trade_trials WHERE organization_id=o.id)";
  const results = await db.batch([
    db.prepare(`SELECT CASE WHEN ${customerAppAuthority} AND EXISTS (
      SELECT 1 FROM organizations o WHERE o.id=? AND o.website IS ? AND o.slug=?
        AND o.organization_type='trade_company' AND o.status='active' AND o.profile_status='approved' AND o.is_demo=0
        AND NOT EXISTS(SELECT 1 FROM badge_rewards WHERE organization_id=o.id)
        AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE organization_id=o.id AND status IN ('active','comped') AND
          (tier IN ('pro','featured') OR stripe_subscription_id GLOB 'lifetime_*'))
        AND NOT EXISTS(SELECT 1 FROM organization_members m LEFT JOIN users_profile u ON u.id=m.user_id
          WHERE m.organization_id=o.id AND NOT EXISTS(SELECT 1 FROM json_each(?) expected
            WHERE json_extract(expected.value,'$.id')=u.id AND json_extract(expected.value,'$.email')=u.email
              AND json_extract(expected.value,'$.primary_role')=u.primary_role))
        AND ${trialStillCurrent}) THEN 1 ELSE json('badge_reward_state_changed') END`)
      .bind(org.id, org.website, org.slug, JSON.stringify(members), ...(before ? [before.startedAt, before.endsAt] : [])),
    db.prepare(`INSERT INTO badge_rewards(organization_id,granted_at,kind,days,domain,distinct_days,detected_on,
      trial_started_before,trial_ends_before,trial_started_after,trial_ends_after) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(org.id, now.toISOString(), change.kind, REWARD_DAYS, install.domain, install.days, install.detectedOn,
        before?.startedAt ?? null, before?.endsAt ?? null, after.startedAt, after.endsAt),
    before
      ? db.prepare("UPDATE trade_trials SET started_at=?,ends_at=? WHERE organization_id=?").bind(after.startedAt, after.endsAt, org.id)
      : db.prepare("INSERT INTO trade_trials(organization_id,started_at,ends_at,source) VALUES(?,?,?,?)")
        .bind(org.id, after.startedAt, after.endsAt, REWARD_SOURCE),
  ]);
  return results[1]?.meta.changes === 1 && results[2]?.meta.changes === 1;
}
