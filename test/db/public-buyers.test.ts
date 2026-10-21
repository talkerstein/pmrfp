import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/**
 * Public-buyer accounts and managed town pages (20261021000040): the widened
 * type checks, sign-up metadata, one organization per page, the public view
 * (contact only when the buyer ticks it), member / claimant / admin reads,
 * no client writes, and that it re-runs.
 */
const MIGRATION = "20261021000040_public_buyer_towns.sql";
let db: PGlite;
const ids = { admin: randomUUID(), clerk: randomUUID(), other: randomUUID(), org: randomUUID(), org2: randomUUID() };
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

beforeAll(async () => {
  db = await createTestDb(["20261007000001_landlord.sql", "20261019000001_dedupe_signups.sql", MIGRATION]);
  // Again after the harness's blanket test grants, so the migration's revokes apply (and it proves it re-runs).
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'root@pmrfp.com', '{}')`, [ids.admin]);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'clerk@cobourg.ca', $2)`, [ids.clerk, JSON.stringify({ primary_role: "public_buyer" })]);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'x@example.com', $2)`, [ids.other, JSON.stringify({ primary_role: "super_admin" })]);
  await db.query(`update users_profile set primary_role = 'admin' where id = $1`, [ids.admin]);
  await db.query(`insert into organizations (id, name, slug, organization_type) values ($1, 'Town of Cobourg', 'town-of-cobourg-x1', 'public_buyer')`, [ids.org]);
  await db.query(`insert into organizations (id, name, slug, organization_type) values ($1, 'Second claimant', 'second-x2', 'public_buyer')`, [ids.org2]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')`, [ids.org, ids.clerk]);
  await db.query(
    `insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method, verified_domain, contact_email, contact_phone, show_contact, intro, upcoming)
     values ('ontario/town-of-cobourg', 'ON', 'Town of Cobourg', $1, 'email_domain', 'cobourg.ca', 'purchasing@cobourg.ca', '905-372-4301', false, 'Hello', '[{"title":"Arena roof","month":"2027-04"}]')`,
    [ids.org],
  );
  await db.query(
    `insert into buyer_claims (buyer_key, buyer_name, province_code, user_id, organization_id, email, email_domain, status, method, decided_at)
     values ('ontario/town-of-cobourg', 'Town of Cobourg', 'ON', $1, $2, 'clerk@cobourg.ca', 'cobourg.ca', 'verified', 'email_domain', now())`,
    [ids.clerk, ids.org],
  );
});

describe("types", () => {
  it("takes the public_buyer role from sign-up metadata, never an admin role", async () => {
    expect(await rows(`select primary_role from users_profile where id = $1`, [ids.clerk])).toEqual([{ primary_role: "public_buyer" }]);
    expect(await rows(`select primary_role from users_profile where id = $1`, [ids.other])).toEqual([{ primary_role: "trade" }]);
  });
  it("widens the organization type check, keeping the others", async () => {
    await expect(db.query(`insert into organizations (name, slug, organization_type) values ('Bad', 'bad-type', 'city')`)).rejects.toThrow();
    for (const type of ["trade_company", "supplier", "landlord", "public_buyer"]) {
      await db.query(`insert into organizations (name, slug, organization_type) values ($1, $2, $1)`, [type, `t-${type}`]);
    }
  });
});

describe("buyer_pages", () => {
  it("one organization per page, one page per organization", async () => {
    await expect(db.query(`insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method) values ('ontario/town-of-cobourg', 'ON', 'Town of Cobourg', $1, 'admin')`, [ids.org2])).rejects.toThrow();
    await expect(db.query(`insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method) values ('ontario/town-of-port-hope', 'ON', 'Port Hope', $1, 'admin')`, [ids.org])).rejects.toThrow();
  });
  it("bounds what a buyer can store (Canada only, links and upcoming list)", async () => {
    const insert = (key: string, extra: string) =>
      db.query(`insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method${extra ? `, ${extra.split("=")[0]}` : ""}) values ($1, 'ON', 'X', $2, 'admin'${extra ? `, ${extra.split("=")[1]}` : ""})`, [key, ids.org2]);
    await expect(insert("ontario/x1", "bids_url='javascript:alert(1)'")).rejects.toThrow();
    await expect(insert("ontario/x2", `upcoming='${JSON.stringify(Array.from({ length: 13 }, () => ({ title: "x", month: "2027-01" })))}'`)).rejects.toThrow();
    await expect(insert("New York/x", "")).rejects.toThrow();
    await expect(db.query(`insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method) values ('ny/x', 'NY', 'X', $1, 'admin')`, [ids.org2])).rejects.toThrow();
  });
  it("anon reads the public view: the contact only when the buyer shows it", async () => {
    const view = async () => asAnon(db, () => rows(`select buyer_key, organization_name, contact_email, contact_phone, intro, upcoming from buyer_pages_public`));
    expect(await view()).toEqual([{ buyer_key: "ontario/town-of-cobourg", organization_name: "Town of Cobourg", contact_email: null, contact_phone: null, intro: "Hello", upcoming: [{ title: "Arena roof", month: "2027-04" }] }]);
    await db.query(`update buyer_pages set show_contact = true`);
    expect((await view())[0]).toMatchObject({ contact_email: "purchasing@cobourg.ca", contact_phone: "905-372-4301" });
    await expect(asAnon(db, () => rows(`select contact_email from buyer_pages`))).rejects.toThrow(/permission denied/);
  });
  it("hides a suspended organization's page", async () => {
    await db.query(`update organizations set status = 'suspended' where id = $1`, [ids.org]);
    expect(await asAnon(db, () => rows(`select buyer_key from buyer_pages_public`))).toEqual([]);
    await db.query(`update organizations set status = 'active' where id = $1`, [ids.org]);
  });
  it("members and admins read the full row; nobody writes through the API", async () => {
    expect(await asUser(db, ids.clerk, () => rows(`select buyer_key from buyer_pages`))).toHaveLength(1);
    expect(await asUser(db, ids.other, () => rows(`select buyer_key from buyer_pages`))).toHaveLength(0);
    expect(await asUser(db, ids.admin, () => rows(`select buyer_key from buyer_pages`))).toHaveLength(1);
    await expect(asUser(db, ids.clerk, () => db.query(`update buyer_pages set intro = 'hacked'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.clerk, () => db.query(`insert into buyer_pages (buyer_key, province_code, buyer_name, organization_id, verified_method) values ('ontario/y', 'ON', 'Y', $1, 'admin')`, [ids.org2]))).rejects.toThrow(/permission denied/);
  });
});

describe("buyer_claims and buyer_domains", () => {
  it("a claimant reads their own claims; admins read all; nobody writes through the API", async () => {
    expect(await asUser(db, ids.clerk, () => rows(`select status from buyer_claims`))).toEqual([{ status: "verified" }]);
    expect(await asUser(db, ids.other, () => rows(`select status from buyer_claims`))).toEqual([]);
    expect(await asUser(db, ids.admin, () => rows(`select status from buyer_claims`))).toHaveLength(1);
    await expect(asAnon(db, () => rows(`select status from buyer_claims`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ids.clerk, () => db.query(`update buyer_claims set status = 'verified'`))).rejects.toThrow(/permission denied/);
  });
  it("one open claim per person per page", async () => {
    const pending = `insert into buyer_claims (buyer_key, buyer_name, province_code, user_id, email) values ('ontario/town-of-port-hope', 'Port Hope', 'ON', $1, 'x@y.ca')`;
    await db.query(pending, [ids.other]);
    await expect(db.query(pending, [ids.other])).rejects.toThrow();
  });
  it("trusted domains are admin-only and well formed", async () => {
    await db.query(`insert into buyer_domains (buyer_key, domain) values ('ontario/town-of-cobourg', 'cobourg.ca')`);
    await expect(db.query(`insert into buyer_domains (buyer_key, domain) values ('ontario/town-of-cobourg', 'not a domain')`)).rejects.toThrow();
    expect(await asUser(db, ids.clerk, () => rows(`select domain from buyer_domains`))).toEqual([]);
    expect(await asUser(db, ids.admin, () => rows(`select domain from buyer_domains`))).toEqual([{ domain: "cobourg.ca" }]);
  });
});
