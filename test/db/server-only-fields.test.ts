import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser } from "./harness";

// Full migration replay with no blanket grants, like api-grants.test.ts: column
// grants only mean something when nothing else hands out the whole table.
let db: PGlite;
const directory = join(process.cwd(), "supabase/migrations");

const ids = {
  owner: "00000000-0000-4000-8000-000000000001",
  paid: "00000000-0000-4000-8000-000000000002",
  trial: "00000000-0000-4000-8000-000000000003",
  stranger: "00000000-0000-4000-8000-000000000004",
  ownerOrg: "10000000-0000-4000-8000-000000000001",
  paidOrg: "10000000-0000-4000-8000-000000000002",
  trialOrg: "10000000-0000-4000-8000-000000000003",
  hiddenOrg: "10000000-0000-4000-8000-000000000004",
  pendingOrg: "10000000-0000-4000-8000-000000000005",
  demoOrg: "10000000-0000-4000-8000-000000000006",
  openRfp: "20000000-0000-4000-8000-000000000001",
  privateRfp: "20000000-0000-4000-8000-000000000002",
  draftRfp: "20000000-0000-4000-8000-000000000003",
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text,
      raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  `);
  await db.exec(`
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon') $$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,name text,bucket_id text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  `);
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(directory, file), "utf8")
      .replace(/create index[^;]*using gin[^;]*;/gi, "")
      .replace(/^create extension[^\n]*/gmi, "");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed`, { cause: error });
    }
  }

  for (const [id, email] of [
    [ids.owner, "owner@example.test"],
    [ids.paid, "paid@example.test"],
    [ids.trial, "trial@example.test"],
    [ids.stranger, "stranger@example.test"],
  ]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [
      id,
      email,
      JSON.stringify({ primary_role: "trade_contractor" }),
    ]);
  }

  const org = (id: string, slug: string, status: string, visibility: string, demo = false) =>
    db.query(
      `insert into organizations (id, name, slug, organization_type, profile_status, public_contact_visibility,
         email, phone, is_demo)
       values ($1,$2,$2,'trade_company',$3,$4,$5,'416-555-0100',$6)`,
      [id, slug, status, visibility, `${slug}@example.test`, demo],
    );
  await org(ids.ownerOrg, "owner-co", "approved", "show_contact");
  await org(ids.paidOrg, "paid-co", "approved", "request_intro");
  await org(ids.trialOrg, "trial-co", "approved", "request_intro");
  await org(ids.hiddenOrg, "hidden-co", "approved", "hide_contact");
  await org(ids.pendingOrg, "pending-co", "pending_review", "show_contact");
  await org(ids.demoOrg, "demo-co", "approved", "show_contact", true);

  const member = (orgId: string, userId: string) =>
    db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [orgId, userId]);
  await member(ids.ownerOrg, ids.owner);
  await member(ids.paidOrg, ids.paid);
  await member(ids.trialOrg, ids.trial);
  await db.query(`insert into subscriptions (organization_id, status, amount) values ($1,'active',249)`, [ids.paidOrg]);
  await db.query(`insert into trade_trials (organization_id, ends_at) values ($1, now() + interval '14 days')`, [ids.trialOrg]);

  await db.query(
    `insert into rfp_posts (id, title, slug, summary, scope, status, posted_by_user_id, posted_by_organization_id, published_at,
       budget_min, budget_max, budget_public, contact_name, contact_email, contact_phone, contact_visibility)
     values ($1,'Open','open-rfp','s','s','published',$2,$3,now(),1000,2000,true,'Pat','pat@example.test','416-555-0101','public_contact')`,
    [ids.openRfp, ids.owner, ids.ownerOrg],
  );
  // The poster kept budget and contact private (the defaults).
  await db.query(
    `insert into rfp_posts (id, title, slug, summary, scope, status, posted_by_user_id, posted_by_organization_id, published_at,
       budget_min, budget_max, contact_name, contact_email, contact_phone)
     values ($1,'Private','private-rfp','s','s','published',$2,$3,now(),3000,4000,'Sam','sam@example.test','416-555-0102')`,
    [ids.privateRfp, ids.owner, ids.ownerOrg],
  );
  await db.query(
    `insert into rfp_posts (id, title, slug, summary, scope, status, posted_by_user_id, posted_by_organization_id,
       budget_min, budget_max, budget_public, contact_name, contact_visibility)
     values ($1,'Draft','draft-rfp','s','s','draft',$2,$3,5000,6000,true,'Lee','public_contact')`,
    [ids.draftRfp, ids.owner, ids.ownerOrg],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

const asOwner = (sql: string, params: unknown[] = []) => asUser(db, ids.owner, () => db.query(sql, params));

describe("companies are created on the server", () => {
  it("won't let a signed-in account insert a company directly", async () => {
    await expect(
      asUser(db, ids.stranger, () =>
        db.query(`insert into organizations (name, slug, organization_type) values ('Made up','made-up','trade_company')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("what a member can change on their own listing", () => {
  it("saves the details the profile forms edit", async () => {
    await asOwner(
      `update organizations set name='Owner Co Ltd', website='https://example.test', phone='416-555-0199', email='hi@example.test',
         address_line_1='1 Main St', city='Toronto', province='ON', country='CA', postal_code='M5V 1A1',
         short_description='a', full_description='b', years_in_business=5, employee_count_range='2-10',
         insurance_status='insured', wsib_status='clearance', emergency_service=true,
         public_contact_visibility='show_contact', logo_url='https://example.test/l.png',
         profile_completion_score=80, profile_status='approved'
       where id=$1`,
      [ids.ownerOrg],
    );
    const { rows } = await db.query<{ name: string; profile_completion_score: number }>(
      `select name, profile_completion_score from organizations where id=$1`,
      [ids.ownerOrg],
    );
    expect(rows[0]).toEqual({ name: "Owner Co Ltd", profile_completion_score: 80 });
  });

  it.each([
    ["platinum", "true"],
    ["featured", "true"],
    ["verified", "true"],
    ["slug", "'taken-name'"],
    ["organization_type", "'supplier'"],
    ["google_rating", "5"],
    ["google_place_id", "'someone-else'"],
    ["is_demo", "true"],
    ["merged_into", "null"],
    ["link_trusted", "true"],
    ["risk_flagged", "false"],
    ["review_flagged_at", "null"],
    ["review_changes", "null"],
    ["approved_at", "now()"],
  ])("refuses a direct change to %s", async (column, value) => {
    await expect(asOwner(`update organizations set ${column}=${value} where id=$1`, [ids.ownerOrg])).rejects.toThrow(/permission denied/);
  });

  it("still won't touch another company", async () => {
    const res = await asOwner(`update organizations set name='Hijacked' where id=$1`, [ids.paidOrg]);
    expect(res.affectedRows ?? 0).toBe(0);
    const { rows } = await db.query<{ name: string }>(`select name from organizations where id=$1`, [ids.paidOrg]);
    expect(rows[0].name).toBe("paid-co");
  });
});

describe("what an account can change on its own profile", () => {
  it("sets its onboarding flag", async () => {
    await asOwner(`update users_profile set onboarding_completed=true where id=$1`, [ids.owner]);
    const { rows } = await db.query<{ onboarding_completed: boolean }>(
      `select onboarding_completed from users_profile where id=$1`,
      [ids.owner],
    );
    expect(rows[0].onboarding_completed).toBe(true);
  });

  it.each([
    ["email", "'someone@else.test'"],
    ["primary_role", "'super_admin'"],
    ["status", "'active'"],
    ["full_name", "'Other Name'"],
  ])("refuses a direct change to %s", async (column, value) => {
    await expect(asOwner(`update users_profile set ${column}=${value} where id=$1`, [ids.owner])).rejects.toThrow(/permission denied/);
  });

  it("can't create a profile row directly", async () => {
    await expect(
      asUser(db, ids.stranger, () =>
        db.query(`insert into users_profile (id, email) values ($1,'x@example.test')`, [ids.pendingOrg]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("organization_public_contact", () => {
  const read = (fn: (q: () => Promise<{ rows: { id: string }[] }>) => Promise<{ rows: { id: string }[] }>) =>
    fn(() => db.query<{ id: string }>(`select id, email, phone from organization_public_contact`));

  it("shows only live companies that chose to show their contact, signed in or not", async () => {
    const anon = await read((q) => asAnon(db, q));
    const user = await read((q) => asUser(db, ids.stranger, q));
    for (const res of [anon, user]) {
      const seen = res.rows.map((r) => r.id);
      expect(seen).toContain(ids.ownerOrg);
      for (const hidden of [ids.paidOrg, ids.trialOrg, ids.hiddenOrg, ids.pendingOrg, ids.demoOrg]) {
        expect(seen).not.toContain(hidden);
      }
    }
  });

  it("offers nothing but id, email and phone", async () => {
    await expect(asAnon(db, () => db.query(`select address_line_1 from organization_public_contact`))).rejects.toThrow(/does not exist/);
  });

  it("can't be written to", async () => {
    await expect(asOwner(`update organization_public_contact set email='x@example.test'`)).rejects.toThrow(/permission denied/);
  });
});

describe("rfp_private_fields", () => {
  type Fields = {
    budget_min: string | number | null;
    budget_max: string | number | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  };
  const call = (uid: string, rfpId: string) =>
    asUser(db, uid, () => db.query<Fields>(`select * from rfp_private_fields($1)`, [rfpId])).then((r) => r.rows);
  const none = { budget_min: null, budget_max: null, contact_name: null, contact_email: null, contact_phone: null };

  it("is closed to anonymous callers", async () => {
    await expect(asAnon(db, () => db.query(`select * from rfp_private_fields($1)`, [ids.openRfp]))).rejects.toThrow(/permission denied/);
  });

  it("returns nothing to a signed-in account without access", async () => {
    expect(await call(ids.stranger, ids.openRfp)).toEqual([]);
    expect(await call(ids.stranger, ids.privateRfp)).toEqual([]);
  });

  it.each([
    ["paid", ids.paid],
    ["trial", ids.trial],
  ])("gives a %s trade what the poster chose to share", async (_label, uid) => {
    const [open] = await call(uid, ids.openRfp);
    expect(Number(open.budget_min)).toBe(1000);
    expect(open.contact_email).toBe("pat@example.test");
    expect(await call(uid, ids.privateRfp)).toEqual([none]);
  });

  it("gives traders nothing on an unpublished RFP", async () => {
    expect(await call(ids.paid, ids.draftRfp)).toEqual([]);
  });

  it("gives the poster their own private values, drafts included", async () => {
    const [own] = await call(ids.owner, ids.privateRfp);
    expect(Number(own.budget_max)).toBe(4000);
    expect(own.contact_name).toBe("Sam");
    const [draft] = await call(ids.owner, ids.draftRfp);
    expect(Number(draft.budget_min)).toBe(5000);
  });
});
