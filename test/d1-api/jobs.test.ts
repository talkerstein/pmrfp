import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { applyVpsJob, createVpsJob, updateVpsJob } from "@/lib/d1/vps-jobs";
import { applicationSchema } from "@/lib/jobs/rules";

it("stores applications for live jobs and scopes management and free quotas to the employer", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(`
      INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users(id) VALUES('owner'),('outsider');
      INSERT INTO users_profile(id,email,primary_role)
        VALUES('owner','owner@example.test','property_manager'),('outsider','outsider@example.test','property_manager');
      INSERT INTO organizations(id,name,slug,profile_status,status) VALUES('company','Company','company','approved','active');
      INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member','company','owner','owner');
      INSERT INTO trade_categories(id,name,slug) VALUES('trade','Roofing','roofing');
      INSERT INTO regions(id,name,slug) VALUES('region','Toronto','toronto');
    `);
    const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
      all: async <T>() => ({ success: true, results: sqlite.prepare(sql).all(...params) as T[], meta: {} }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    });
    const db: D1Binding = {
      prepare,
      async batch<T>(statements: D1Statement[]) {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.all<T>());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    const now = "2026-11-27";
    const expiry = "2026-12-27";
    const company = { orgId: "company", userId: "owner", pro: false };
    const outsider = { ...company, userId: "outsider" };
    const form = { title: "Roofing helper", category: "roofing", region: "toronto", city: "Toronto",
      employmentType: "full_time" as const, description: "Help our team maintain and repair commercial roofs." };
    await expect(createVpsJob(outsider, form, "outside", now, expiry, db)).resolves.not.toBe("posted");
    for (const slug of ["first", "second", "third"]) {
      await expect(createVpsJob(company, form, slug, now, expiry, db)).resolves.toBe("posted");
    }
    await expect(createVpsJob(company, form, "fourth", now, expiry, db)).resolves.toBe("freeLimitPost");
    const jobId = String(sqlite.prepare("SELECT id FROM job_posts WHERE slug='first'").get()?.id);
    const application = applicationSchema.parse({ slug: "first", name: "Applicant", email: "applicant@example.test" });
    await expect(applyVpsJob(application, now, db)).resolves.toMatchObject({ trade: "roofing", recipient: "owner@example.test" });
    expect(sqlite.prepare("SELECT count(*) AS count FROM job_applications").get()?.count).toBe(1);
    await expect(updateVpsJob(outsider, jobId, "close", now, expiry, db)).resolves.toEqual({ error: "notYours" });
    await expect(updateVpsJob(company, jobId, "close", now, expiry, db)).resolves.toEqual({ slug: "first" });
    await expect(applyVpsJob(application, now, db)).resolves.toBeNull();
    await expect(updateVpsJob(company, jobId, "renew", now, expiry, db)).resolves.toEqual({ slug: "first" });
    await expect(applyVpsJob(application, "2026-12-28", db)).resolves.toBeNull();
  } finally {
    sqlite.close();
  }
});
