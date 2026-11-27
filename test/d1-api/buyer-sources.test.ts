import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { buyerSourceRequestSchema } from "@/lib/buyers/source-requests";
import { PERMISSION_SEED } from "@/lib/buyers/permissions";
import { decideVpsBuyerSource, listVpsBuyerSourceRequests, recordVpsBuyerSourceRequest, vpsBuyerReviewCounts } from "@/lib/d1/buyer-sources";
import { decideVpsBuyerClaim, submitVpsBuyerClaim } from "@/lib/d1/vps-buyer-claims";
import { readVpsBuyerDashboard, updateVpsBuyerPage } from "@/lib/d1/vps-buyer-pages";
import { serveCompanyMedia } from "@/lib/d1/vps-company-media";
import type { SessionContext } from "@/lib/access/access";
import { domainOwners } from "@/lib/towns/domains";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";

function localBinding(sqlite: DatabaseSync): D1Binding {
  const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
    bind: (...values) => prepare(sql, values),
    first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
    all: async <T>() => (/^SELECT/i.test(sql)
      ? { success: true, results: sqlite.prepare(sql).all(...params) as T[], meta: {} }
      : { success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  });
  return {
    prepare,
    async batch<T>(statements: D1Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const rows = [];
        for (const statement of statements) rows.push(await statement.all<T>());
        sqlite.exec("COMMIT");
        return rows;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

it("stores buyer source requests and atomically records an authorized decision against the migrated D1 schema", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const admin = "00000000-0000-4000-8000-000000000091";
    const suspended = "00000000-0000-4000-8000-000000000092";
    for (const [id, status] of [[admin, "active"], [suspended, "suspended"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role,status) VALUES(?,?,'admin',?)")
        .run(id, id + "@example.test", status);
    }
    const db = localBinding(sqlite);
    const request = buyerSourceRequestSchema.parse({
      organization: "Test Public Buyer",
      contactName: "Test Buyer",
      workEmail: "Buyer@example.test",
      tendersUrl: "https://www.example.test/tenders",
      method: "read_public_page",
      provinceCode: "ON",
      authorized: true,
    });
    await recordVpsBuyerSourceRequest(request, "read on its public page", db);
    expect(await vpsBuyerReviewCounts(db)).toEqual({ claims: 0, requests: 1 });
    const [row] = await listVpsBuyerSourceRequests(admin, false, db);
    expect(row).toMatchObject({ work_email: "buyer@example.test", status: "new" });
    expect(await listVpsBuyerSourceRequests(suspended, true, db)).toEqual([]);
    expect(sqlite.prepare("SELECT user_id,type FROM notifications").all()).toEqual([{ user_id: admin, type: "buyer_source_request" }]);

    const base = { id: row.id, action: "approve", method: "read_public_page", buyerSlug: "test-public-buyer" } as const;
    expect(await decideVpsBuyerSource(base, suspended, db)).toBe("not_found");
    expect(await decideVpsBuyerSource({ ...base, method: "feed" }, admin, db)).toBe("missing_feed");
    const refused = PERMISSION_SEED.find((permission) => permission.status === "no");
    expect(refused).toBeDefined();
    expect(await decideVpsBuyerSource({ ...base, buyerSlug: refused!.buyerSlug }, admin, db)).toBe("refused");

    sqlite.exec("CREATE TRIGGER block_approval BEFORE INSERT ON buyer_permissions BEGIN SELECT RAISE(ABORT,'blocked'); END");
    await expect(decideVpsBuyerSource(base, admin, db)).rejects.toThrow("blocked");
    expect(await vpsBuyerReviewCounts(db)).toEqual({ claims: 0, requests: 1 });
    expect(sqlite.prepare("SELECT action FROM audit_logs").all()).toEqual([]);
    sqlite.exec("DROP TRIGGER block_approval");

    expect(await decideVpsBuyerSource(base, admin, db)).toBe("approved");
    expect(await decideVpsBuyerSource({ action: "reject", id: row.id }, admin, db)).toBe("already_decided");
    expect(await vpsBuyerReviewCounts(db)).toEqual({ claims: 0, requests: 0 });
    expect(sqlite.prepare("SELECT buyer_slug,status,source_request_id FROM buyer_permissions").get()).toMatchObject({
      buyer_slug: "test-public-buyer", status: "yes", source_request_id: row.id,
    });
    expect(sqlite.prepare("SELECT actor_user_id,action FROM audit_logs").all()).toEqual([{ actor_user_id: admin, action: "buyer_source.approve" }]);
    expect(await decideVpsBuyerSource({ action: "note", id: row.id, notes: "Written confirmation reviewed" }, admin, db)).toBe("saved");
    expect((await listVpsBuyerSourceRequests(admin, true, db))[0]).toMatchObject({ status: "approved", admin_notes: "Written confirmation reviewed" });
    sqlite.exec("DELETE FROM _customer_app_authority");
    await expect(recordVpsBuyerSourceRequest(request, "read on its public page", db)).rejects.toThrow("buyer_source_requests_unavailable");
    expect(sqlite.prepare("SELECT count(*) AS count FROM buyer_source_requests").get()).toMatchObject({ count: 1 });
  } finally {
    sqlite.close();
  }
});

it("processes page claims, membership joins, and scoped edits using the migrated D1 schema", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/company-media.sql", "utf8"));
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const ids = [91, 92, 93, 94, 95].map((n) => `00000000-0000-4000-8000-0000000000${n}`);
    const [admin, mayor, associate, clerk] = ids;
    for (const [i, id] of ids.entries()) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)")
        .run(id, `user${i}@${i === 3 ? "provincial.example" : "town.example"}`, i ? "public_buyer" : "admin");
    }
    const holder = { identity: "ontario/town-example", website: "https://town.example", domains: ["town.example"] };
    const buyer = { key: holder.identity, provinceSlug: "ontario", slug: "town-example", path: "/buyers/ontario/town-example",
      name: "Town Example", provinceCode: "ON", province: "Ontario", holder };
    const nextBuyer = { ...buyer, key: "ontario/another-town", slug: "another-town", name: "Another Town",
      holder: { identity: "ontario/another-town", website: null, domains: [] } };
    const owners = domainOwners([holder, nextBuyer.holder]);
    const now = "2026-11-27T07:00:00.000Z";
    const db = localBinding(sqlite);
    const who = (userId: string, email: string) => ({ userId, email, emailConfirmed: true, fullName: "Test Clerk",
      jobTitle: null, phone: null, note: null });
    const mine = await submitVpsBuyerClaim({ buyer, owners, now, who: who(mayor, "user1@town.example") }, db);
    expect(mine.status).toBe("verified");
    if (mine.status !== "verified") throw new Error("Missing verified claim");
    expect(sqlite.prepare("SELECT organization_id FROM buyer_pages WHERE buyer_key=?").get(buyer.key))
      .toMatchObject({ organization_id: mine.organizationId });
    const joining = await submitVpsBuyerClaim({ buyer, owners, now, who: who(associate, "user2@town.example") }, db);
    expect(joining).toMatchObject({ status: "join_requested", organizationId: mine.organizationId });
    expect(sqlite.prepare("SELECT organization_id,status FROM organization_join_requests WHERE user_id=?").get(associate))
      .toMatchObject({ status: "pending", organization_id: mine.organizationId });
    expect(sqlite.prepare("SELECT user_id,type FROM notifications").all()).toEqual([{ user_id: mayor, type: "join_request" }]);

    const pending = await submitVpsBuyerClaim({ buyer: nextBuyer, owners, now, who: who(clerk, "user3@provincial.example") }, db);
    expect(pending.status).toBe("pending");
    if (pending.status !== "pending" || !pending.claimId) throw new Error("Missing pending claim");
    const decision = { claimId: pending.claimId, adminId: admin, approve: true, trustDomain: true, notes: "Reviewed", now };
    expect(await decideVpsBuyerClaim({ ...decision, adminId: associate }, db)).toEqual({ ok: false, reason: "not_found" });
    expect(await decideVpsBuyerClaim(decision, db)).toMatchObject({ ok: true, status: "verified" });
    expect(await decideVpsBuyerClaim(decision, db)).toEqual({ ok: false, reason: "not_pending" });
    expect(sqlite.prepare("SELECT buyer_key,domain FROM buyer_domains").all())
      .toEqual([{ buyer_key: nextBuyer.key, domain: "provincial.example" }]);

    const session = { userId: mayor, organization: { id: mine.organizationId } } as SessionContext;
    const noAccess = { ...session, userId: associate };
    const changes = { contactEmail: "private@town.example", contactPhone: null, showContact: false,
      bidsUrl: null, platformUrl: null, vendorRegistrationUrl: null, intro: "Our purchasing team", upcoming: [] };
    const logo = ids[4];
    sqlite.prepare(`INSERT INTO _company_media(id,organization_id,kind,sha256,bytes,created_at,ready)
      VALUES(?,?,'logo',?,100,1,1)`).run(logo, mine.organizationId, "a".repeat(64));
    expect((await readVpsBuyerDashboard(noAccess, db)).own).toBeNull();
    expect(await updateVpsBuyerPage(noAccess, changes, null, now, db)).toBeNull();
    await expect(updateVpsBuyerPage(session, changes, "https://malicious.example/logo.png", now, db))
      .rejects.toThrow("invalid_buyer_page_logo");
    expect(await updateVpsBuyerPage(session, changes, `/api/company-media/${logo}`, now, db)).toBe(buyer.key);
    expect((await readVpsBuyerDashboard(session, db)).own).toMatchObject({ contact_email: "private@town.example", show_contact: false,
      intro: "Our purchasing team", logo_url: `/api/company-media/${logo}` });
    expect(await updateVpsBuyerPage(session, changes, "", now, db)).toBe(buyer.key);
    expect((await readVpsBuyerDashboard(session, db)).own?.logo_url).toBeNull();
    expect((await serveCompanyMedia(logo, true, null, db)).status).toBe(404);
  } finally {
    sqlite.close();
  }
});
