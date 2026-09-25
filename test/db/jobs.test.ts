import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asUser, createTestDb } from "./harness";

/** Jobs migration (20260925000004): who sees which jobs and applicants; no direct writes. */
const JOBS = "20260925000004_jobs.sql";
let db: PGlite;
const ids = { owner: randomUUID(), stranger: randomUUID(), org: randomUUID(), pending: randomUUID(), open: randomUUID(), closed: randomUUID() };

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = await createTestDb([JOBS]);
  await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", JOBS), "utf8")); // safe to re-run
  for (const [id, name] of [[ids.owner, "Owner"], [ids.stranger, "Stranger"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [
      id,
      `${name}@example.com`,
      JSON.stringify({ full_name: name, primary_role: "trade" }),
    ]);
  }
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Acme','acme','trade_company','approved')`, [ids.org]);
  await db.query(`insert into organizations (id, name, slug, organization_type, profile_status) values ($1,'Pending Co','pending-co','trade_company','pending_review')`, [ids.pending]);
  await db.query(`insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')`, [ids.org, ids.owner]);
  const job = (id: string, org: string, slug: string, status: string, expires: string) =>
    db.query(
      `insert into job_posts (id, slug, organization_id, title, city, employment_type, description, status, expires_at)
       values ($1,$2,$3,'Electrician','Toronto','full_time',$4,$5,$6)`,
      [id, slug, org, "Service and install work on commercial sites across the GTA.", status, expires],
    );
  await job(ids.open, ids.org, "electrician-open", "open", "2099-01-01");
  await job(ids.closed, ids.org, "electrician-closed", "closed", "2099-01-01");
  await job(randomUUID(), ids.org, "electrician-expired", "open", "2000-01-01");
  await job(randomUUID(), ids.pending, "electrician-pending", "open", "2099-01-01");
  await db.query(`insert into job_applications (job_id, name, email) values ($1,'Sam Tech','sam@example.com')`, [ids.open]);
});

describe("jobs", () => {
  it("shows the public only open, unexpired jobs from approved companies", async () => {
    const slugs = await asAnon(db, () => rows<{ slug: string }>("select slug from job_posts order by slug"));
    expect(slugs.map((r) => r.slug)).toEqual(["electrician-open"]);
  });

  it("shows the hiring company all of its own jobs and its applicants", async () => {
    const own = await asUser(db, ids.owner, () => rows<{ slug: string }>("select slug from job_posts where organization_id = $1 order by slug", [ids.org]));
    expect(own).toHaveLength(3);
    const apps = await asUser(db, ids.owner, () => rows("select * from job_applications"));
    expect(apps).toHaveLength(1);
  });

  it("keeps applicants private from everyone else", async () => {
    expect(await asUser(db, ids.stranger, () => rows("select * from job_applications"))).toHaveLength(0);
    expect(await asAnon(db, () => rows("select * from job_applications"))).toHaveLength(0);
  });

  it("lets nobody write directly (the server writes with the service role)", async () => {
    await expect(
      asAnon(db, () => db.query(`insert into job_applications (job_id, name, email) values ($1,'Spam','spam@example.com')`, [ids.open])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.stranger, () =>
        db.query(
          `insert into job_posts (slug, organization_id, title, city, employment_type, description) values ('fake-job',$1,'Fake job','Toronto','full_time',$2)`,
          [ids.org, "x".repeat(60)],
        ),
      ),
    ).rejects.toThrow();
  });
});
