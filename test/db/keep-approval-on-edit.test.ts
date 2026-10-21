import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";
import { selectAlertAudience, type AlertOrg } from "@/lib/pm-jobs/alerts";
import type { RegionRow } from "@/lib/pm-jobs/regions";
import { respondDecision } from "@/lib/pm-jobs/rules";

/**
 * Migration 20261021000030 against real Postgres (PGlite): an approved
 * company that edits its own profile stays approved and listed, trust-field
 * edits are flagged for an admin's look, members can't touch the flag, the
 * old flow holds for every other status, and the repair only restores
 * companies the data proves were approved.
 */

const MIGRATION = "20261021000030_keep_approval_on_edit.sql";
const sql = () => readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");
let db: PGlite;

const ids = {
  admin: randomUUID(),
  ann: randomUUID(), // member of acme (approved)
  rita: randomUUID(), // member of rejected
  sam: randomUUID(), // member of suspended
  dina: randomUUID(), // member of draft
  acme: randomUUID(),
  rejected: randomUUID(),
  suspended: randomUUID(),
  draft: randomUUID(),
  // repair cases, all pending_review when the migration runs
  wasApproved: randomUUID(),
  neverApproved: randomUUID(),
  adminReversed: randomUUID(),
  rejectedLater: randomUUID(),
};

async function rows<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  return (await db.query<T>(q, params)).rows;
}
async function org(id: string) {
  return (
    await rows<{ profile_status: string; review_flagged_at: string | null; review_changes: Record<string, { from: unknown; to: unknown }> | null; approved_at: string | null }>(
      `select profile_status, review_flagged_at, review_changes, approved_at from organizations where id = $1`,
      [id],
    )
  )[0];
}

beforeAll(async () => {
  // Karma first, so the repair has its ledger; the migration itself runs below, after the "before" data.
  db = await createTestDb(["20260924000002_gc_packages.sql", "20261010000001_karma.sql"]);
  for (const [id, name] of [[ids.admin, "Root"], [ids.ann, "Ann"], [ids.rita, "Rita"], [ids.sam, "Sam"], [ids.dina, "Dina"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: "trade" })]);
  }
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);

  const mk = (id: string, slug: string, status: string) =>
    db.query(`insert into organizations (id, name, slug, organization_type, profile_status, website, email) values ($1,$2,$2,'trade_company',$3,'https://old.example','old@example.com')`, [id, slug, status]);
  await mk(ids.acme, "acme", "approved");
  await mk(ids.rejected, "rejected-co", "rejected");
  await mk(ids.suspended, "suspended-co", "suspended");
  await mk(ids.draft, "draft-co", "draft");
  await mk(ids.wasApproved, "was-approved", "pending_review");
  await mk(ids.neverApproved, "never-approved", "pending_review");
  await mk(ids.adminReversed, "admin-reversed", "pending_review");
  await mk(ids.rejectedLater, "rejected-later", "pending_review");
  for (const [o, u] of [[ids.acme, ids.ann], [ids.rejected, ids.rita], [ids.suspended, ids.sam], [ids.draft, ids.dina]]) {
    await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [o, u]);
  }

  // The karma sync wrote profile_approved while these were approved, then reversed it when they left 'approved'.
  const approval = (o: string, reason: string | null) =>
    db.query(
      `insert into karma_events (org_id, kind, points, source_type, source_id, actor_id, reversed_at, reversed_reason)
       values ($1::uuid, 'profile_approved', 20, 'organization', $2::text, '', case when $3::text is null then null else now() end, $3::text)`,
      [o, o, reason],
    );
  await approval(ids.wasApproved, "sync: no longer eligible");
  await approval(ids.adminReversed, "admin: fake company");
  await approval(ids.rejectedLater, "sync: no longer eligible");
  await db.query(`insert into audit_logs (action, entity_type, entity_id) values ('organization.rejected', 'organization', $1)`, [ids.rejectedLater]);

  await db.exec(sql());
  await db.exec(sql()); // safe to re-run
});

afterAll(async () => {
  await db?.close();
});

describe("an approved company editing its own profile", () => {
  it("stays approved and listed when it edits anything", async () => {
    await asUser(db, ids.ann, () => db.query(`update organizations set phone = '416-555-0100', city = 'Toronto' where id = $1`, [ids.acme]));
    const o = await org(ids.acme);
    expect(o.profile_status).toBe("approved");
    // Phone and city aren't trust fields: nothing to check.
    expect(o.review_flagged_at).toBeNull();
    const listed = await asAnon(db, () => rows(`select id from organizations where id = $1`, [ids.acme]));
    expect(listed).toHaveLength(1);
  });

  it("flags a name or website change for an admin's look, old → new, still approved", async () => {
    await asUser(db, ids.ann, () => db.query(`update organizations set name = 'Acme Roofing Ltd', website = 'https://new.example' where id = $1`, [ids.acme]));
    const o = await org(ids.acme);
    expect(o.profile_status).toBe("approved");
    expect(o.review_flagged_at).not.toBeNull();
    expect(o.review_changes).toEqual({
      name: { from: "acme", to: "Acme Roofing Ltd" },
      website: { from: "https://old.example", to: "https://new.example" },
    });
  });

  it("keeps the first 'from' across edits and drops a field changed back, without clearing the flag", async () => {
    const first = (await org(ids.acme)).review_flagged_at;
    await asUser(db, ids.ann, () => db.query(`update organizations set name = 'Acme Roofing', website = 'https://old.example', email = 'new@example.com' where id = $1`, [ids.acme]));
    const o = await org(ids.acme);
    expect(o.review_changes).toEqual({
      name: { from: "acme", to: "Acme Roofing" },
      email: { from: "old@example.com", to: "new@example.com" },
    });
    expect(o.review_flagged_at).toEqual(first);
  });

  it("doesn't let a member clear or forge the flag or approval date", async () => {
    await expect(asUser(db, ids.ann, () => db.query(`update organizations set review_flagged_at = null where id = $1`, [ids.acme]))).rejects.toThrow(/administrator/);
    await expect(asUser(db, ids.ann, () => db.query(`update organizations set review_changes = '{}'::jsonb where id = $1`, [ids.acme]))).rejects.toThrow(/administrator/);
    await expect(asUser(db, ids.ann, () => db.query(`update organizations set approved_at = now() where id = $1`, [ids.acme]))).rejects.toThrow(/administrator/);
    expect((await org(ids.acme)).review_flagged_at).not.toBeNull();
  });

  it("stays a job-alert recipient and can still respond for free while flagged", async () => {
    const [row] = await rows<{ id: string; name: string; organization_type: string; status: string; profile_status: string; is_demo: boolean; city: string | null; province: string | null }>(
      `select id, name, organization_type, status, profile_status, is_demo, city, province from organizations where id = $1`,
      [ids.acme],
    );
    expect((await org(ids.acme)).review_flagged_at).not.toBeNull();
    const regions: RegionRow[] = [
      { id: "ca", name: "Canada", slug: "canada", parent_id: null, province: null, country: "Canada" },
      { id: "on", name: "Ontario", slug: "ontario", parent_id: "ca", province: "Ontario", country: "Canada" },
      { id: "to", name: "Toronto", slug: "toronto", parent_id: "on", province: "Ontario", country: "Canada" },
    ];
    const trade: AlertOrg = { ...row, countries: new Set(["CA"]) };
    const audience = selectAlertAudience({
      job: { id: "j", region_id: "to", city: "Toronto", province: "Ontario", country: "CA", categoryIds: ["roof"], posted_by_user_id: "pm", posted_by_organization_id: "pm-org" },
      regions,
      orgs: [trade],
      catsByOrg: new Map([[ids.acme, new Set(["roof"])]]),
      regionsByOrg: new Map([[ids.acme, ["to"]]]),
      usersByOrg: new Map([[ids.acme, [ids.ann]]]),
      users: new Map([[ids.ann, { email: "ann@example.com", status: "active" }]]),
      optedOut: new Set(),
      alreadySent: new Set(),
    });
    expect(audience.recipients.map((r) => r.userId)).toEqual([ids.ann]);

    const decision = respondDecision({
      signedIn: true,
      org: row,
      pro: false,
      rfp: { status: "published", source_type: "property_manager_direct", posted_by_user_id: "pm", posted_by_organization_id: "pm-org" },
      userId: ids.ann,
      usedThisMonth: 0,
    });
    expect(decision).toEqual({ refusal: null, free: true });
  });

  it("is never flagged for an admin or service-role edit", async () => {
    await db.query(`update organizations set review_flagged_at = null, review_changes = null where id = $1`, [ids.acme]);
    await db.query(`update organizations set website = 'https://by-staff.example' where id = $1`, [ids.acme]);
    await asUser(db, ids.admin, () => db.query(`update organizations set name = 'Acme (staff fix)' where id = $1`, [ids.acme]));
    const o = await org(ids.acme);
    expect(o.review_flagged_at).toBeNull();
    expect(o.profile_status).toBe("approved");
  });
});

describe("every other status keeps the old flow", () => {
  it("a rejected or suspended company can resubmit, never approve itself", async () => {
    for (const [user, o] of [[ids.rita, ids.rejected], [ids.sam, ids.suspended]]) {
      await expect(asUser(db, user, () => db.query(`update organizations set profile_status = 'approved' where id = $1`, [o]))).rejects.toThrow();
      await asUser(db, user, () => db.query(`update organizations set name = 'New name', profile_status = 'pending_review' where id = $1`, [o]));
      const row = await org(o);
      expect(row.profile_status).toBe("pending_review");
      expect(row.review_flagged_at).toBeNull();
    }
  });

  it("a draft company submits for review as before", async () => {
    await asUser(db, ids.dina, () => db.query(`update organizations set website = 'https://draft.example', profile_status = 'pending_review' where id = $1`, [ids.draft]));
    const row = await org(ids.draft);
    expect(row.profile_status).toBe("pending_review");
    expect(row.review_flagged_at).toBeNull();
  });

  it("stamps approved_at when an admin approves", async () => {
    expect((await org(ids.draft)).approved_at).toBeNull();
    await asUser(db, ids.admin, () => db.query(`update organizations set profile_status = 'approved' where id = $1`, [ids.draft]));
    expect((await org(ids.draft)).approved_at).not.toBeNull();
  });
});

describe("repair of companies the old code sent back to pending_review", () => {
  it("restores the one the karma ledger proves was approved, flagged for a look, with an audit row", async () => {
    const o = await org(ids.wasApproved);
    expect(o.profile_status).toBe("approved");
    expect(o.review_flagged_at).not.toBeNull();
    const audit = await rows(`select action from audit_logs where entity_id = $1 and action = 'organization.approval_restored'`, [ids.wasApproved]);
    expect(audit).toHaveLength(1); // ran twice, restored once
  });

  it("leaves alone: never approved, approval reversed by an admin, rejected by an admin", async () => {
    for (const id of [ids.neverApproved, ids.adminReversed, ids.rejectedLater]) {
      const o = await org(id);
      expect(o.profile_status).toBe("pending_review");
      expect(o.review_flagged_at).toBeNull();
    }
  });

  it("applies on a database without the karma ledger (nothing to repair from)", async () => {
    const bare = await createTestDb([MIGRATION]);
    try {
      const cols = await bare.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'organizations' and column_name in ('approved_at','review_flagged_at','review_changes') order by 1`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual(["approved_at", "review_changes", "review_flagged_at"]);
    } finally {
      await bare.close();
    }
  });
});
