import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * RLS verification — the security gate behind PMRFP's monetization.
 * Asserts that paid/unpaid/anon/PM/admin personas see exactly what the
 * spec (§9.1, §12) requires, against the real migrations in PGlite.
 */

let db: PGlite;

const ids = {
  admin: randomUUID(),
  paidTrade: randomUUID(),
  unpaidTrade: randomUUID(),
  pm: randomUUID(),
  otherPm: randomUUID(),
  paidOrg: randomUUID(),
  unpaidOrg: randomUUID(),
  pmOrg: randomUUID(),
  otherPmOrg: randomUUID(),
  draftOrg: randomUUID(),
  publishedRfp: randomUUID(),
  draftRfp: randomUUID(),
  otherPublishedRfp: randomUUID(),
};

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

beforeAll(async () => {
  db = await createTestDb();

  // ── auth users (trigger creates users_profile with the given role) ──
  const mkUser = (id: string, role: string, name: string) =>
    db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
      [id, `${name}@example.com`, JSON.stringify({ full_name: name, primary_role: role })],
    );
  await mkUser(ids.admin, "admin", "Admin");
  await mkUser(ids.paidTrade, "trade", "PaidTrade");
  await mkUser(ids.unpaidTrade, "trade", "UnpaidTrade");
  await mkUser(ids.pm, "property_manager", "PM");
  await mkUser(ids.otherPm, "property_manager", "OtherPM");

  // ── organizations ──
  const mkOrg = (id: string, slug: string, type: string, status: string) =>
    db.query(
      `insert into organizations (id, name, slug, organization_type, profile_status)
       values ($1,$2,$3,$4,$5)`,
      [id, slug, slug, type, status],
    );
  await mkOrg(ids.paidOrg, "paid-trade", "trade_company", "approved");
  await mkOrg(ids.unpaidOrg, "unpaid-trade", "trade_company", "approved");
  await mkOrg(ids.pmOrg, "pm-org", "property_manager", "approved");
  await mkOrg(ids.otherPmOrg, "other-pm-org", "property_manager", "approved");
  await mkOrg(ids.draftOrg, "draft-trade", "trade_company", "draft");

  const mkMember = (org: string, user: string) =>
    db.query(
      `insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`,
      [org, user],
    );
  await mkMember(ids.paidOrg, ids.paidTrade);
  await mkMember(ids.unpaidOrg, ids.unpaidTrade);
  await mkMember(ids.pmOrg, ids.pm);
  await mkMember(ids.otherPmOrg, ids.otherPm);

  // paid org has an active subscription; unpaid org has none.
  await db.query(
    `insert into subscriptions (organization_id, status, amount) values ($1,'active',249)`,
    [ids.paidOrg],
  );

  // ── RFPs ──
  const mkRfp = (
    id: string,
    slug: string,
    status: string,
    user: string,
    org: string,
  ) =>
    db.query(
      `insert into rfp_posts (id, title, slug, summary, scope, status, posted_by_user_id, posted_by_organization_id, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, case when $6='published' then now() else null end)`,
      [id, slug, slug, "summary", "secret scope details", status, user, org],
    );
  await mkRfp(ids.publishedRfp, "published-rfp", "published", ids.pm, ids.pmOrg);
  await mkRfp(ids.draftRfp, "draft-rfp", "draft", ids.pm, ids.pmOrg);
  await mkRfp(ids.otherPublishedRfp, "other-published-rfp", "published", ids.otherPm, ids.otherPmOrg);
});

describe("has_active_trade_access", () => {
  it("is true for a paid trade, false for an unpaid trade", async () => {
    const paid = await rows<{ ok: boolean }>(`select public.has_active_trade_access($1) as ok`, [ids.paidTrade]);
    const unpaid = await rows<{ ok: boolean }>(`select public.has_active_trade_access($1) as ok`, [ids.unpaidTrade]);
    expect(paid[0].ok).toBe(true);
    expect(unpaid[0].ok).toBe(false);
  });
});

describe("organizations visibility", () => {
  it("anon sees approved orgs but not draft/unapproved ones", async () => {
    const r = await asAnon(db, () => rows(`select slug from organizations`));
    const slugs = r.map((x) => (x as { slug: string }).slug);
    expect(slugs).toContain("paid-trade");
    expect(slugs).not.toContain("draft-trade");
  });
  it("admin sees the draft org too", async () => {
    const r = await asUser(db, ids.admin, () => rows(`select slug from organizations where slug='draft-trade'`));
    expect(r.length).toBe(1);
  });
});

describe("RFP gating — the monetization wall", () => {
  it("anon cannot read any full rfp_posts rows", async () => {
    const r = await asAnon(db, () => rows(`select id from rfp_posts`));
    expect(r.length).toBe(0);
  });

  it("anon CAN read published teasers via rfp_public (no scope column exposed)", async () => {
    const r = await asAnon(db, () => rows(`select slug from rfp_public`));
    const slugs = r.map((x) => (x as { slug: string }).slug);
    expect(slugs).toContain("published-rfp");
    expect(slugs).toContain("other-published-rfp");
    expect(slugs).not.toContain("draft-rfp");
    // The teaser view must not leak the gated scope column.
    await expect(asAnon(db, () => rows(`select scope from rfp_public`))).rejects.toThrow();
  });

  it("unpaid trade cannot read full published RFPs", async () => {
    const r = await asUser(db, ids.unpaidTrade, () => rows(`select id from rfp_posts where status='published'`));
    expect(r.length).toBe(0);
  });

  it("paid trade CAN read full published RFPs (incl. scope) but not drafts", async () => {
    const r = await asUser(db, ids.paidTrade, () =>
      rows<{ slug: string; scope: string }>(`select slug, scope from rfp_posts`),
    );
    const slugs = r.map((x) => x.slug);
    expect(slugs).toContain("published-rfp");
    expect(slugs).toContain("other-published-rfp");
    expect(slugs).not.toContain("draft-rfp");
    expect(r.find((x) => x.slug === "published-rfp")?.scope).toBe("secret scope details");
  });

  it("PM owner can read their own draft RFP; not another PM's draft", async () => {
    const own = await asUser(db, ids.pm, () => rows(`select id from rfp_posts where slug='draft-rfp'`));
    expect(own.length).toBe(1);
    const other = await asUser(db, ids.pm, () => rows(`select id from rfp_posts where status='published' and slug='other-published-rfp'`));
    // published is visible to everyone via base? No — base only owner/paid/admin. PM is not paid, not owner of other.
    expect(other.length).toBe(0);
  });

  it("admin reads every RFP including drafts", async () => {
    const r = await asUser(db, ids.admin, () => rows(`select id from rfp_posts`));
    expect(r.length).toBe(3);
  });
});

describe("express interest + save (paid-only writes)", () => {
  it("unpaid trade CANNOT insert an interest", async () => {
    await expect(
      asUser(db, ids.unpaidTrade, () =>
        db.query(
          `insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message)
           values ($1,$2,$3,'hi')`,
          [ids.publishedRfp, ids.unpaidOrg, ids.unpaidTrade],
        ),
      ),
    ).rejects.toThrow();
  });

  it("paid trade CAN insert an interest, and the owning PM can read it", async () => {
    await asUser(db, ids.paidTrade, () =>
      db.query(
        `insert into rfp_interests (rfp_id, trade_organization_id, submitted_by_user_id, message)
         values ($1,$2,$3,'We can do this')`,
        [ids.publishedRfp, ids.paidOrg, ids.paidTrade],
      ),
    );
    const pmView = await asUser(db, ids.pm, () =>
      rows(`select message from rfp_interests where rfp_id=$1`, [ids.publishedRfp]),
    );
    expect(pmView.length).toBe(1);
    // A different PM cannot see interests on someone else's RFP.
    const otherView = await asUser(db, ids.otherPm, () =>
      rows(`select message from rfp_interests where rfp_id=$1`, [ids.publishedRfp]),
    );
    expect(otherView.length).toBe(0);
  });

  it("unpaid trade CANNOT save an RFP; paid trade can", async () => {
    await expect(
      asUser(db, ids.unpaidTrade, () =>
        db.query(`insert into saved_rfps (user_id, organization_id, rfp_id) values ($1,$2,$3)`, [
          ids.unpaidTrade, ids.unpaidOrg, ids.publishedRfp,
        ]),
      ),
    ).rejects.toThrow();
    await asUser(db, ids.paidTrade, () =>
      db.query(`insert into saved_rfps (user_id, organization_id, rfp_id) values ($1,$2,$3)`, [
        ids.paidTrade, ids.paidOrg, ids.publishedRfp,
      ]),
    );
    const saved = await asUser(db, ids.paidTrade, () => rows(`select id from saved_rfps`));
    expect(saved.length).toBe(1);
  });
});

describe("contact_requests + resources", () => {
  it("anon can submit a contact request but cannot read them; admin can read", async () => {
    await asAnon(db, () =>
      db.query(`insert into contact_requests (request_type, requester_email, message) values ('general_contact','x@y.com','hello')`),
    );
    const anonRead = await asAnon(db, () => rows(`select id from contact_requests`));
    expect(anonRead.length).toBe(0);
    const adminRead = await asUser(db, ids.admin, () => rows(`select id from contact_requests`));
    expect(adminRead.length).toBeGreaterThanOrEqual(1);
  });

  it("anon sees only published resources", async () => {
    await db.query(`insert into resources (title, slug, status) values ('Pub','pub-res','published')`);
    await db.query(`insert into resources (title, slug, status) values ('Draft','draft-res','draft')`);
    const r = await asAnon(db, () => rows(`select slug from resources`));
    const slugs = r.map((x) => (x as { slug: string }).slug);
    expect(slugs).toContain("pub-res");
    expect(slugs).not.toContain("draft-res");
  });
});

describe("reference data loaded", () => {
  it("has 41 categories, 21 regions, 21 property types", async () => {
    const c = await rows(`select id from trade_categories`);
    const rg = await rows(`select id from regions`);
    const p = await rows(`select id from property_types`);
    expect(c.length).toBe(41);
    expect(rg.length).toBe(21);
    expect(p.length).toBe(21);
  });
});

describe("privilege-escalation hardening (0006)", () => {
  it("blocks a non-admin from promoting their own role", async () => {
    await expect(
      asUser(db, ids.unpaidTrade, () =>
        rows(`update users_profile set primary_role='super_admin' where id=$1`, [ids.unpaidTrade])),
    ).rejects.toThrow();
    const r = await rows<{ primary_role: string }>(
      `select primary_role from users_profile where id=$1`,
      [ids.unpaidTrade],
    );
    expect(r[0].primary_role).toBe("trade");
  });

  it("blocks a member from self-approving their org but allows submit-for-review", async () => {
    const uid = randomUUID();
    const oid = randomUUID();
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`,
      [uid, "selftest@example.com", JSON.stringify({ full_name: "Self", primary_role: "trade" })],
    );
    await db.query(
      `insert into organizations (id, name, slug, organization_type, profile_status)
       values ($1,'Self Co','self-co','trade_company','draft')`,
      [oid],
    );
    await db.query(
      `insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`,
      [oid, uid],
    );

    // Cannot jump straight to approved.
    await expect(
      asUser(db, uid, () =>
        rows(`update organizations set profile_status='approved' where id=$1`, [oid])),
    ).rejects.toThrow();

    // Can submit for review.
    await asUser(db, uid, () =>
      rows(`update organizations set profile_status='pending_review' where id=$1`, [oid]));
    const r = await rows<{ profile_status: string }>(
      `select profile_status from organizations where id=$1`,
      [oid],
    );
    expect(r[0].profile_status).toBe("pending_review");
  });

  it("blocks a member from self-verifying / featuring their org", async () => {
    await expect(
      asUser(db, ids.unpaidTrade, () =>
        rows(`update organizations set verified=true where id=$1`, [ids.unpaidOrg])),
    ).rejects.toThrow();
  });
});
