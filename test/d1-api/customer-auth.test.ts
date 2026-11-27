import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { customerAuthBootstrap, mapMigrationAccount, refreshCustomerAuthStatements } from "../../scripts/d1-auth/import-plan.mjs";
import { handleCustomerAuth } from "../../workers/d1-api/customer-auth";
import { readVpsBillingAccount } from "../../src/lib/d1/vps-billing-account";
import { provisionVpsGoogleProfile } from "../../src/lib/auth/vps-google-provision";
import { callVpsCustomer } from "../../src/lib/d1/vps-customer";
import { readVpsCompanySelections, updateVpsCompanyProfile } from "../../src/lib/d1/vps-company-profile";
import { companyProfileSchema, interestSchema } from "../../src/lib/validations";
import { isLegacyPortfolioAsset, listCompanyPortfolio, normalizeCompanyMedia, removeCompanyPortfolioPhoto, serveCompanyMedia, uploadCompanyMedia } from "../../src/lib/d1/vps-company-media";
import privateStorage from "../../workers/storage-preview/private-project-files";
import { listPublicDirectory } from "../../workers/d1-api/directory";
import { cancelVpsJoinRequest, createVpsJoinRequest, decideVpsJoinRequest, listVpsJoinRequests, readVpsPendingJoin } from "../../src/lib/d1/vps-join-requests";
import { reviewVpsRfp } from "../../src/lib/d1/vps-rfp-review";
import { postVpsRfp } from "../../src/lib/d1/vps-rfp-post";
import { closeVpsRfp } from "../../src/lib/d1/vps-rfp-close";
import { readVpsPublicTenderUrl, readVpsRfpDetail } from "../../src/lib/d1/vps-rfp-detail";
import { readVpsInterestHistory, readVpsRfpRespondState, submitVpsRfpInterest } from "../../src/lib/d1/vps-rfp-interest";
import { syncD1LinkSignals } from "../../src/lib/links/sync";
import { decideVpsBid } from "../../src/lib/d1/vps-bid-decisions";
import { readVpsBidInbox } from "../../src/lib/d1/vps-bid-inbox";
import { beginVpsTalentContact, endorseVpsTalent, saveVpsTalent } from "../../src/lib/d1/vps-talent";
import { talentProfileSchema } from "../../src/lib/talent/rules";
import { recordVpsMarketplaceContact, moderateVpsListing, saveVpsListing, setVpsListingStatus, vpsFeatureListing } from "../../src/lib/marketplace/native";
import { serveVpsListingPhoto, uploadVpsListingPhoto } from "../../src/lib/marketplace/native-media";
import { listingSchema } from "../../src/lib/marketplace/rules";
import * as vpsD1 from "../../src/lib/d1/http-binding";
import { listPublicProjects } from "../../src/lib/data/portfolio";
import { heroUrlsBySlug, listOrgProjects, listPublishedReviews, ratingsBySlug } from "../../src/lib/data/projects";
import { resolveVpsReviewPhoto } from "../../src/lib/d1/vps-project-reviews";
import { hashReviewToken } from "../../src/lib/projects/tokens";
import { handleNativeProjectPhoto } from "../../workers/d1-api/project-photos";
import { isVpsTrustedTradeSaved, recordVpsTrustedQuote, toggleVpsTrustedTrade, updateVpsTrustedNote, updateVpsTrustedPage } from "../../src/lib/trusted/native";
import { loadVpsHistorySlice, readVpsHistoryAward, readVpsHistoryBids } from "../../src/lib/contract-history/load";
import { syncPublicSources, type Candidate } from "../../src/lib/tenders/sync";
import { runAutoThreads } from "../../src/lib/forum/auto-threads-server";
import { sendTradeContactShared, sendTradeDeclined, sendTradeNotSelected, sendTradePicked } from "../../src/lib/email/send";
import type { SessionContext } from "../../src/lib/access/access";
import type { SandboxObjectMetadata } from "../../workers/d1-api/project-photos";

vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/email/send", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/email/send")>(),
  sendTradeContactShared: vi.fn(), sendTradeDeclined: vi.fn(), sendTradeNotSelected: vi.fn(), sendTradePicked: vi.fn(),
}));
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";

function d1(db: DatabaseSync): D1Binding & { exec: (sql: string) => void } {
  function prepare(sql: string, values: (string | number | null)[] = []): D1Statement {
    return {
      bind: (...bound) => prepare(sql, bound),
      first: async <T>() => (db.prepare(sql).get(...values) ?? null) as T | null,
      all: async <T>() => ({
        success: true, results: db.prepare(sql).all(...values) as T[],
        meta: { changes: Number(db.prepare("SELECT changes() AS n").get()?.n) },
      }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
    };
  }
  return {
    prepare, exec: sql => db.exec(sql),
    batch: async <T>(statements: D1Statement[]) => {
      db.exec("BEGIN");
      try {
        // Each adapter method runs its SQLite statement synchronously.
        const results = await Promise.all(statements.map(statement => statement.all<T>()));
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

it("imports public tenders, preserves private listings, and publishes one board thread per eligible tender", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-board-revision.sql", "utf8"));
    db.exec(`INSERT INTO trade_categories(id,name,slug) VALUES('roofing','Roofing','roofing');
      INSERT INTO regions(id,name,slug) VALUES('ontario','Ontario','ontario');
      INSERT INTO _auth_users VALUES('board');
      INSERT INTO forum_profiles(user_id,handle,display_name,is_staff,is_system) VALUES('board','pmrfp_board','PMRFP Board',1,1);
      INSERT INTO forum_categories(id,slug,name) VALUES('forum','general-contractors','General Contractors');
      INSERT INTO forum_categories(id,slug,name) VALUES('roof','roofing-envelope','Roofing');
      INSERT INTO rfp_posts(id,slug,title,status,keep_alive_token) VALUES('private','private','Private request','published','private-token');`);
    const today = "2026-11-27";
    const candidate = (id: number, deadline: string): Candidate => ({
      categories: ["roofing"], regionSlug: "ontario",
      insert: {
        title: "Roof replacement for municipal building " + id, slug: `roof-cb-161-${id}`,
        source_url: `https://example.test/bids/${id}`, summary: "Public tender for a municipal building.", scope: "Replacement of the roof.",
        province: "Ontario", deadline, submission_instructions: "Contact the issuing authority", requirements: null, contact_name: null,
        contact_email: null, contact_phone: null, contact_visibility: "public_contact", source_notes: "", source_type: "public_source",
        status: "published", is_demo: false, published_at: today + "T00:00:00Z",
      },
    });
    const binding = d1(db);
    const run = (rows: Candidate[], dry = false) => syncPublicSources(binding, [
      { key: "canadabuys", minMatchesToArchive: 1, collect: async () => rows },
    ], { today, dry });
    const first = candidate(1, "2026-12-03");
    const second = candidate(2, "2026-12-04");
    await expect(run([first])).rejects.toThrow();
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect((await run([first, second], true)).body).toMatchObject({ wouldInsert: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM rfp_posts").get()?.n).toBe(1);
    expect((await run([first, second])).body).toMatchObject({ inserted: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM rfp_categories").get()?.n).toBe(2);
    const amended = candidate(1, "2026-12-05");
    expect((await run([amended])).body).toMatchObject({ inserted: 0, refreshed: 1, archived: 1, logged: 2 });
    expect((await run([amended])).body).toMatchObject({ inserted: 0, refreshed: 0, archived: 0, logged: 0 });
    expect(db.prepare("SELECT status FROM rfp_posts WHERE id='private'").get()?.status).toBe("published");
    expect(db.prepare("SELECT count(*) AS n FROM rfp_changes").get()?.n).toBe(2);
    const opts = { days: 10, cap: 5, now: new Date(today + "T14:00:00Z"), dry: true };
    expect(await runAutoThreads(binding, opts)).toMatchObject({ ready: true, planned: 1, created: 0 });
    expect(await runAutoThreads(binding, { ...opts, dry: false })).toMatchObject({ ready: true, created: 1 });
    expect(await runAutoThreads(binding, { ...opts, dry: false })).toMatchObject({ planned: 0, created: 0 });
  } finally {
    db.close();
  }
});

it("restricts the bid inbox and commits bid decisions, contact sharing and notices together", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const poster = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
    const trade = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const rfp = "a910c237-a6cf-423a-ad19-291a884fed01";
    const [pick, decline, other] = ["f10dc237-a6cf-423a-ad19-291a884fed01", "f10dc237-a6cf-423a-ad19-291a884fed02", "f10dc237-a6cf-423a-ad19-291a884fed03"];
    for (const [id, email, role] of [[poster, "poster@example.test", "property_manager"], [trade, "trade@example.test", "trade"]]) {
      db.prepare("INSERT INTO _auth_users VALUES(?)").run(id);
      db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)").run(id, email, role);
    }
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,posted_by_user_id,keep_alive_token)
      VALUES(?,'Roof tender','roof-tender','published','property_manager_direct',?,'roof-token')`).run(rfp, poster);
    for (const [index, id] of [pick, decline, other].entries()) {
      const company = "trade-" + index;
      db.prepare(`INSERT INTO organizations(id,name,slug,email,public_contact_visibility)
        VALUES(?,'Roofing company',?,'contact@example.test','hide_contact')`).run(company, company);
      db.prepare(`INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,submitted_by_user_id)
        VALUES(?,?,?,?)`).run(id, rfp, company, trade);
    }
    const binding = d1(db);
    const decide = (kind: Parameters<typeof decideVpsBid>[0], interest: string, note: string | null = null) =>
      decideVpsBid(kind, poster, rfp, interest, note, binding);
    expect((await readVpsBidInbox(trade, rfp, binding)).interests).toEqual([]);
    expect(await decideVpsBid("pick", trade, rfp, pick, null, binding)).toEqual({ ok: false, error: "not_owner" });
    expect((await readVpsBidInbox(poster, rfp, binding)).orgs.get("trade-0")?.email).toBeNull();
    expect(await decide("shortlist", pick)).toMatchObject({ ok: true });
    expect(await decide("share", pick)).toMatchObject({ ok: true });
    expect(await decide("share", pick)).toMatchObject({ ok: true });
    expect(sendTradeContactShared).toHaveBeenCalledTimes(1);
    expect(await decide("decline", decline, "  thank you  ")).toMatchObject({ ok: true });
    expect(sendTradeDeclined).toHaveBeenCalledWith("trade@example.test", expect.objectContaining({ note: "thank you" }));
    db.exec(`CREATE TRIGGER fail_award BEFORE UPDATE ON rfp_posts WHEN new.status='awarded'
      BEGIN SELECT RAISE(ABORT,'fixture'); END`);
    await expect(decide("pick", pick)).rejects.toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n).toBe(2);
    expect(db.prepare("SELECT status FROM rfp_interests WHERE id=?").get(pick)?.status).toBe("shortlisted");
    db.exec("DROP TRIGGER fail_award");
    expect(await decide("pick", pick)).toMatchObject({ ok: true });
    expect(await decide("pick", other)).toEqual({ ok: false, error: "closed" });
    expect(sendTradePicked).toHaveBeenCalledTimes(1);
    expect(sendTradeNotSelected).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n).toBe(4);
    const inbox = await readVpsBidInbox(poster, rfp, binding);
    expect(inbox.job?.status).toBe("awarded");
    expect(inbox.orgs.get("trade-0")?.email).toBe("contact@example.test");
    expect(inbox.interests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pick, status: "picked" }),
      expect.objectContaining({ id: decline, status: "declined" }),
      expect.objectContaining({ id: other, status: "not_selected" }),
    ]));
  } finally {
    db.close();
  }
});

it("saves a talent profile and its private phone in one transaction for an active account", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO trade_categories(id,name,slug) VALUES('roofing','Roofing','roofing');
      INSERT INTO regions(id,name,slug) VALUES('toronto','Toronto','toronto');
      INSERT INTO _auth_users VALUES('person'),('other');
      INSERT INTO users_profile(id,email,primary_role) VALUES
        ('person','talent@example.test','talent'),('other','other@example.test','talent');`);
    const form = talentProfileSchema.parse({ handle: "roofer", displayName: "Roofing tech",
      primaryTrade: "roofing", region: "toronto", availability: "available_now",
      phone: "416-555-0142", published: false, contactVisible: false });
    const store = d1(db);
    db.exec("CREATE TRIGGER fail_talent_phone BEFORE INSERT ON talent_private BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect(await saveVpsTalent("person", "roofer", form, store)).toBe("couldNotSave");
    expect(db.prepare("SELECT count(*) AS n FROM talent_profiles").get()?.n).toBe(0);
    db.exec("DROP TRIGGER fail_talent_phone");
    expect(await saveVpsTalent("person", "roofer", form, store)).toBe("saved");
    expect(await saveVpsTalent("other", "roofer", form, store)).toBe("handleTaken");
    expect(db.prepare("SELECT published,contact_visible FROM talent_profiles").get()).toMatchObject({ published: 0, contact_visible: 0 });
    expect(db.prepare("SELECT phone FROM talent_private").get()?.phone).toBe("416-555-0142");
    db.exec("UPDATE users_profile SET status='suspended' WHERE id='person'");
    expect(await saveVpsTalent("person", "roofer", { ...form, phone: "" }, store)).toBe("couldNotSave");
    expect(db.prepare("SELECT phone FROM talent_private").get()?.phone).toBe("416-555-0142");
  } finally {
    db.close();
  }
});

it("keeps talent contact and endorsement scoped to approved employers and enforces the monthly cap", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users VALUES('worker'),('employer'),('other');
      INSERT INTO users_profile(id,email,primary_role) VALUES
        ('worker','worker@example.test','talent'),('employer','employer@example.test','trade'),
        ('other','other@example.test','trade');
      INSERT INTO organizations(id,name,slug,organization_type,profile_status,status)
        VALUES('company','Employer','employer','trade_company','approved','active'),
        ('another','Other Employer','other','trade_company','approved','active');
      INSERT INTO organization_members(id,organization_id,user_id) VALUES('membership','company','employer');
      INSERT INTO talent_profiles(user_id,handle,display_name,published,contact_visible)
        VALUES('worker','worker','Worker',1,0),('employer','employer','Employer',1,0),('other','other','Other',0,0);`);
    const binding = d1(db);
    const employer = { userId: "employer", orgId: "company", pro: false };
    const november = new Date("2026-11-27T12:00:00Z");
    const contact = (handle: string) => beginVpsTalentContact(employer, handle, binding, november);
    const note = { handle: "worker", note: "Diligent work on roof repairs." };
    expect(await endorseVpsTalent(employer, note, binding)).toBe("endorseProof");
    expect(await contact("employer")).toEqual({ status: "self" });
    expect(await contact("other")).toEqual({ status: "missing" });
    expect(await beginVpsTalentContact({ ...employer, orgId: "another" }, "worker", binding, november)).toEqual({ status: "missing" });
    expect(await contact("worker")).toMatchObject({ status: "recorded", left: 2, person: { email: "worker@example.test" } });
    expect(await contact("worker")).toMatchObject({ status: "recorded", left: 1 });
    expect(await contact("worker")).toMatchObject({ status: "recorded", left: 0 });
    expect(await contact("worker")).toEqual({ status: "limit" });
    expect(await endorseVpsTalent({ ...employer, orgId: "another" }, note, binding)).toBe("profileUnavailable");
    expect(await endorseVpsTalent(employer, note, binding)).toBe("saved");
    expect(await endorseVpsTalent(employer, { ...note, note: "Returned for a second roofing job." }, binding)).toBe("saved");
    expect(db.prepare("SELECT note FROM talent_endorsements").all()).toEqual([{ note: "Returned for a second roofing job." }]);
    expect(await beginVpsTalentContact(employer, "worker", binding, new Date("2026-12-01T00:00:00Z")))
      .toMatchObject({ status: "recorded", left: 2 });
    db.exec("UPDATE organizations SET status='suspended' WHERE id='company'");
    expect(await contact("worker")).toEqual({ status: "missing" });
    expect(await endorseVpsTalent(employer, note, binding)).toBe("profileUnavailable");
  } finally {
    db.close();
  }
});

it("reads each billing account only while the signed-in profile belongs to that company", async () => {
  const db = new DatabaseSync(":memory:");
  const userId = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const organization = { id: "e5952844-51ad-4ff4-9632-b25ef0ba6759" };
  const session = { userId, organization } as SessionContext;
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(userId);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,'billing@fixture.example','trade')").run(userId);
    db.prepare("INSERT INTO organizations(id,name,slug) VALUES(?,'Billing company','billing-company')").run(organization.id);
    db.prepare("INSERT INTO subscriptions(id,organization_id,stripe_customer_id) VALUES('sub',?,'cus_trade')").run(organization.id);
    db.prepare("INSERT INTO intel_access(organization_id,stripe_customer_id) VALUES(?,'cus_intel')").run(organization.id);
    expect(await readVpsBillingAccount(session, "subscription", d1(db))).toBeNull();
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member',?,?,'owner')")
      .run(organization.id, userId);
    expect(await readVpsBillingAccount(session, "subscription", d1(db))).toMatchObject({ stripe_customer_id: "cus_trade" });
    expect(await readVpsBillingAccount(session, "intel", d1(db))).toMatchObject({ stripe_customer_id: "cus_intel" });
    db.prepare("UPDATE users_profile SET status='suspended' WHERE id=?").run(userId);
    expect(await readVpsBillingAccount(session, "subscription", d1(db))).toBeNull();
  } finally {
    db.close();
  }
});

it("recomputes directory signals from D1 without writing during a dry run", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(`INSERT INTO organizations(id, name, slug, website, email, profile_status)
      VALUES('trade','Roofing company','roofing-co','https://roofing.example','info@roofing.example','approved');
      INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('sub','trade','active','pro');`);
    const binding = d1(db);
    const dry = { dry: true };
    await expect(syncD1LinkSignals(binding, dry)).rejects.toThrow("customer_app_authority_unavailable");
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect(await syncD1LinkSignals(binding, dry)).toMatchObject({ considered: 1, changed: 1, paid: 1 });
    expect(db.prepare("SELECT link_paid FROM organizations").get()?.link_paid).toBe(0);
    expect(await syncD1LinkSignals(binding)).toMatchObject({ considered: 1, changed: 1 });
    expect(db.prepare("SELECT link_paid,email_domain_verified FROM organizations").get()).toMatchObject({ link_paid: 1, email_domain_verified: 1 });
    expect(await syncD1LinkSignals(binding)).toMatchObject({ considered: 1, changed: 0 });
  } finally {
    db.close();
  }
});

it("provisions Google signup once, repairs a failed profile write and rejects mailbox aliases", async () => {
  const auth = new DatabaseSync(":memory:");
  const app = new DatabaseSync(":memory:");
  try {
    auth.exec(readFileSync("workers/auth-preview/schema.sql", "utf8").split("-- Explicit sandbox marker")[0]);
    auth.exec(readFileSync("deploy/vps/customer-auth-authority.sql", "utf8"));
    auth.exec("INSERT INTO _auth_native_authority VALUES(1,'native-v1')");
    app.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    app.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    const sign = (email: string, subject: string, allowCreate = true) =>
      provisionVpsGoogleProfile(d1(auth), d1(app), { email, subject, lang: "fr", allowCreate });
    const email = "google.profile@gmail.com";
    await expect(sign(email, "100")).rejects.toThrow("customer_app_authority_unavailable");
    app.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect(await sign(email, "100", false)).toBeNull();
    app.exec(`CREATE TRIGGER fixture_fail_profile BEFORE INSERT ON users_profile BEGIN
      SELECT RAISE(ABORT,'test profile failure'); END`);
    await expect(sign(email, "100")).rejects.toThrow("test profile failure");
    const { id } = auth.prepare("SELECT id FROM user WHERE email=?").get(email) as { id: string };
    expect(app.prepare("SELECT 1 FROM _auth_users WHERE id=?").get(id)).toBeUndefined();
    app.exec("DROP TRIGGER fixture_fail_profile");
    expect(await sign(email, "100", false)).toBe(email);
    expect(await sign(email, "100", true)).toBe(email);
    expect(await sign(email, "101")).toBeNull();
    expect(await sign("googleprofile+alias@googlemail.com", "102")).toBeNull();
    expect(auth.prepare("SELECT count(*) AS count FROM user").get()?.count).toBe(1);
    expect(app.prepare("SELECT id,email,primary_role,onboarding_completed FROM users_profile").get())
      .toMatchObject({ id, email, primary_role: "trade", onboarding_completed: 0 });
    expect(app.prepare("SELECT user_id,scope,source,lang FROM email_consents").all())
      .toEqual([{ user_id: id, scope: "service", source: "google_signup", lang: "fr" }]);
  } finally {
    auth.close();
    app.close();
  }
});

it("posts a property manager tender for review with its categories in one batch", async () => {
  const db = new DatabaseSync(":memory:");
  const manager = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const admin = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(manager);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,'pm@fixture.example','property_manager')").run(manager);
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(admin);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,'admin@fixture.example','admin')").run(admin);
    db.exec("INSERT INTO regions(id,name,slug) VALUES('r','Toronto','toronto')");
    db.exec("INSERT INTO trade_categories(id,name,slug) VALUES('roofing','Roofing','roofing')");
    const input = { title: "Roof replacement", summary: "Short summary", scope: "Full scope", regionSlug: "toronto",
      categories: ["roofing"], deadline: new Date(Date.now() + 86400000),
      contactVisibility: "pmrfp_mediated", acceptTerms: true } as const;
    const post = (categories: string[]) => postVpsRfp(manager, null, "roofing-pm", "en", { ...input, categories }, d1(db));
    await expect(post(["roofing", "wrong-category"])).rejects.toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM rfp_posts").get()?.n).toBe(0);
    const id = await post(["roofing", "roofing"]);
    expect(db.prepare("SELECT id,status,posted_by_user_id,region_id FROM rfp_posts").get())
      .toMatchObject({ id, status: "pending_review", posted_by_user_id: manager, region_id: "r" });
    expect(db.prepare("SELECT rfp_id,category_id FROM rfp_categories").all()).toEqual([{ rfp_id: id, category_id: "roofing" }]);
    expect(await reviewVpsRfp(manager, id, "published", null, d1(db))).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n).toBe(0);
    expect(await reviewVpsRfp(admin, id, "published", null, d1(db))).toMatchObject({ id, email: "pm@fixture.example" });
    expect(await reviewVpsRfp(admin, id, "rejected", "late duplicate", d1(db))).toBeNull();
    expect(db.prepare("SELECT user_id,type FROM notifications").all()).toEqual([{ user_id: manager, type: "rfp_published" }]);
    expect(db.prepare("SELECT status,published_at FROM rfp_posts").get()).toMatchObject({ status: "published", published_at: expect.any(String) });
  } finally {
    db.close();
  }
});

it("closes a live tender once and denies a different account", async () => {
  const db = new DatabaseSync(":memory:");
  const poster = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const other = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  const tender = "b953050e-4f62-4132-9cd3-41a473d16907";
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-board-revision.sql", "utf8"));
    for (const actor of [poster, other]) {
      db.prepare("INSERT INTO _auth_users VALUES(?)").run(actor);
      db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'property_manager')")
        .run(actor, actor + "@example.test");
    }
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,posted_by_user_id,status,keep_alive_token)
      VALUES(?,'Roof','roof',?,'published',?)`).run(tender, poster, tender);
    await expect(closeVpsRfp(poster, tender, "closed", d1(db))).rejects.toThrow();
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect(await closeVpsRfp(other, tender, "closed", d1(db))).toBe("not_owner");
    expect(await closeVpsRfp(poster, tender, "closed", d1(db))).toBe("ok");
    expect(await closeVpsRfp(poster, tender, "awarded", d1(db))).toBe("closed");
    expect(db.prepare("SELECT status,closed_at FROM rfp_posts WHERE id=?").get(tender))
      .toMatchObject({ status: "closed", closed_at: expect.any(String) });
    expect(db.prepare("SELECT revision FROM _native_board_revision").get()?.revision).toBe(2);
  } finally {
    db.close();
  }
});

it("keeps company edits, taxonomy, moderation and audit records in the same D1 transaction", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/company-media.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/company-insurance-policies.sql", "utf8"));
    const org = "org-local";
    const user = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(user);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'trade')").run(user, "owner@fixture-roofing.ca");
    db.exec(`INSERT INTO organizations(id,name,slug,profile_status,logo_url,link_badge,link_earned_at)
      VALUES('org-local','Original','original','approved','https://files.example.test/logo.jpg',1,'2026-11-01');
      INSERT INTO organizations(id,name,slug) VALUES('other','Other company','other');
      INSERT INTO trade_categories(id,name,slug) VALUES('c','Roofing','roofing');
      INSERT INTO regions(id,name,slug) VALUES('r','Toronto','toronto');
      INSERT INTO property_types(id,name,slug) VALUES('p','Commercial','commercial');
      INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('sub','org-local','comped','seo');
      INSERT INTO blocked_domains(domain) VALUES('example.net');`);
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member',?,?,'owner')").run(org, user);
    const identity = { userId: user, organization: { id: org } };
    const session = identity as Parameters<typeof updateVpsCompanyProfile>[0];
    const profile = companyProfileSchema.parse({
      name: "New name", email: "owner@fixture-roofing.ca", website: "https://legitimate.example.test", province: "ON",
      insurancePolicyNumber: " FIXTURE-PRIVATE ",
      publicContactVisibility: "request_intro", categories: ["roofing"], regions: ["toronto"], propertyTypes: ["commercial"],
    });
    await expect(updateVpsCompanyProfile(session, profile, null, 75, d1(db))).rejects.toThrow();
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    await expect(updateVpsCompanyProfile({ ...session, organization: { ...session.organization!, id: "other" } },
      profile, null, 75, d1(db))).rejects.toThrow();
    await expect(updateVpsCompanyProfile(session, profile, "https://unrelated.example.test/image.jpg", 75, d1(db))).rejects.toThrow();
    expect(await updateVpsCompanyProfile(session, profile, null, 75, d1(db))).toEqual({ stayedLive: true, rejected: null });
    expect(await readVpsCompanySelections(identity, d1(db))).toEqual({
      categories: ["roofing"], regions: ["toronto"], propertyTypes: ["commercial"], paid: true,
      insurancePolicyNumber: "FIXTURE-PRIVATE",
    });
    await expect(readVpsCompanySelections({ ...identity, organization: { id: "other" } }, d1(db))).rejects.toThrow();
    const publicCompanies = await listPublicDirectory(d1(db), new URL("https://pmrfp.com/v1/directory"), true);
    expect(publicCompanies.items).toEqual([expect.objectContaining({
      name: "New name", email: null, link_badge: false, insurance_status: "Insured",
    })]);
    expect(JSON.stringify(publicCompanies)).not.toContain("FIXTURE-PRIVATE");
    const read = () => db.prepare(`SELECT name,profile_status,logo_url,link_badge,review_changes,risk_flagged
      FROM organizations WHERE id=?`).get(org);
    const saved = read()!;
    expect(saved).toMatchObject({ name: "New name", profile_status: "approved", logo_url: "https://files.example.test/logo.jpg", link_badge: 0 });
    expect(JSON.parse(String(saved.review_changes))).toMatchObject({ name: { from: "Original", to: "New name" } });
    await expect(updateVpsCompanyProfile(session, { ...profile, name: "Failed edit", regions: ["missing"] }, null, 75, d1(db))).rejects.toThrow();
    expect(read()).toEqual(saved);
    expect(db.prepare("SELECT count(*) AS n FROM audit_logs").get()?.n).toBe(1);
    const revision = db.prepare("SELECT updated_at FROM organizations WHERE id=?").get(org)?.updated_at as string;
    const guided = { ...session, organization: { ...session.organization!, updated_at: revision } };
    const phone = { ...profile, phone: "416 555 0100", name: "Ignored edit", regions: [], insurancePolicyNumber: "IGNORED" };
    expect(await updateVpsCompanyProfile(guided, phone, null, 75, d1(db), "phone")).toEqual({ stayedLive: true, rejected: null });
    expect(db.prepare("SELECT name,phone FROM organizations WHERE id=?").get(org)).toMatchObject({ name: "New name", phone: "416 555 0100" });
    expect(await readVpsCompanySelections(identity, d1(db))).toMatchObject({ regions: ["toronto"], insurancePolicyNumber: "FIXTURE-PRIVATE" });
    await expect(updateVpsCompanyProfile(guided, { ...phone, phone: "416 555 0200" }, null, 75, d1(db), "phone")).rejects.toThrow("company_profile_changed");
    const result = await updateVpsCompanyProfile(session, {
      ...profile, name: "Original", website: "https://blocked.example.net", insurancePolicyNumber: "",
    }, "", 75, d1(db));
    expect(result.rejected?.blocked).toBe(true);
    expect(db.prepare("SELECT count(*) AS n FROM _organization_insurance_policies").get()?.n).toBe(0);
    expect(read()).toMatchObject({ name: "Original", profile_status: "rejected", logo_url: null, risk_flagged: 1 });
    expect(JSON.parse(String(read()?.review_changes))).not.toHaveProperty("name");
    expect(db.prepare("SELECT blocked,source FROM organization_risk WHERE organization_id=?").get(org))
      .toMatchObject({ blocked: 1, source: "profile_edit" });
  } finally {
    db.close();
  }
});

it("gates paid history, awards, and bids by current D1 membership and removes names of individuals", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users VALUES('subscriber'),('outsider'),('admin');
      INSERT INTO users_profile(id,email,primary_role) VALUES
        ('subscriber','subscriber@example.test','trade'),('outsider','outsider@example.test','trade'),
        ('admin','admin@example.test','admin');
      INSERT INTO organizations(id,name,slug,organization_type,status,profile_status)
        VALUES('company','Subscriber','subscriber','trade_company','active','approved');
      INSERT INTO organization_members(id,organization_id,user_id) VALUES('membership','company','subscriber');
      INSERT INTO intel_access(organization_id,status,source) VALUES('company','comped','admin');
      INSERT INTO award_history(id,source,source_key,board_ref,title,buyer,winner_business_name,winner_is_individual,
        value,currency,country,award_date,trade_slugs,licence,attribution,as_of,non_competitive,procurement_method)
        VALUES('history','ca-source','one','one','Roof contract','Municipal buyer','Individual name',1,
          '12345.67','CAD','CA','2025-10-01','["roofing"]','Open licence','Credit','2025-10-02',1,'Direct award');
      INSERT INTO bid_results(id,award_history_id,bidder_business_name,bidder_key,bidder_is_individual,bid_amount,currency,
        rank,status_label,as_of,source) VALUES
          ('first','history','Individual bidder','a',1,'13000','CAD',1,'awarded','2025-10-02','ca-source'),
          ('second','history','Business bidder','b',0,'14000','CAD',NULL,'not_awarded','2025-10-02','ca-source');`);
    const binding = d1(db);
    const subscriber = { userId: "subscriber", organization: { id: "company" }, hasIntelAccess: true } as SessionContext;
    const other = { ...subscriber, userId: "outsider" };
    const today = "2026-11-27";
    expect(await loadVpsHistorySlice({ ...subscriber, hasIntelAccess: false }, binding, today)).toEqual([]);
    expect(await loadVpsHistorySlice(other, binding, today)).toEqual([]);
    expect(await readVpsHistoryAward("history", other, binding)).toBeNull();
    expect(await readVpsHistoryBids("history", other, binding)).toEqual([]);
    expect(await loadVpsHistorySlice(subscriber, binding, today)).toEqual([expect.objectContaining({
      id: "history", winner_is_individual: true, winner_business_name: null, has_bids: true, value: 12345.67,
      trade_slugs: ["roofing"], non_competitive: true, procurement_method: "Direct award",
    })]);
    expect(await readVpsHistoryAward("history", subscriber, binding)).toMatchObject({ currency: "CAD", value: 12345.67, licence: "Open licence" });
    expect(await readVpsHistoryBids("history", subscriber, binding)).toMatchObject([
      { bidder_is_individual: true, bidder_business_name: null, bid_amount: 13_000 },
      { bidder_is_individual: false, bidder_business_name: "Business bidder", bid_amount: 14_000 },
    ]);
    db.exec("UPDATE intel_access SET expires_at='2020-01-01T00:00:00Z'");
    expect(await loadVpsHistorySlice(subscriber, binding, today)).toEqual([]);
    expect(await readVpsHistoryAward("history", subscriber, binding)).toBeNull();
    const admin = { ...subscriber, userId: "admin", organization: null };
    expect(await readVpsHistoryAward("history", admin, binding)).toMatchObject({ id: "history" });
    db.exec("UPDATE users_profile SET status='suspended' WHERE id='admin'");
    expect(await readVpsHistoryAward("history", admin, binding)).toBeNull();
  } finally {
    db.close();
  }
});

it("enforces Trusted Trades ownership, paid contact settings and visibility for quote requests", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users VALUES('realtor'),('trade');
      INSERT INTO users_profile(id,email,full_name,primary_role) VALUES
        ('realtor','realtor@example.test','Listed Realtor','real_estate_agent'),
        ('trade','trade@example.test','Listed Trade','trade');
      INSERT INTO organizations(id,name,slug,organization_type,status,profile_status)
        VALUES('broker','Broker','broker','owner','active','approved');
      INSERT INTO organization_members(id,organization_id,user_id) VALUES('member','broker','realtor');`);
    const connection = d1(db);
    for (let i = 1; i <= 6; i++) db.prepare(`INSERT INTO organizations(id,name,slug,organization_type,status,profile_status,email)
      VALUES(?,?,?,'trade_company','active','approved',?)`).run(`vendor-${i}`, `Vendor ${i}`, `vendor-${i}`, `vendor-${i}@example.test`);
    const member = { userId: "realtor", profile: { full_name: "Listed Realtor" }, organization: { id: "broker", name: "Broker" } } as SessionContext;
    expect(await toggleVpsTrustedTrade({ ...member, userId: "trade" }, "vendor-1", connection)).toHaveProperty("error");
    for (let i = 1; i <= 5; i++) expect(await toggleVpsTrustedTrade(member, `vendor-${i}`, connection)).toMatchObject({ saved: true });
    expect(await toggleVpsTrustedTrade(member, "vendor-6", connection)).toMatchObject({ limit: true });
    expect(await isVpsTrustedTradeSaved(member.userId, "vendor-1", connection)).toBe(true);
    expect(await updateVpsTrustedNote("trade", "vendor-1", "Other note", connection)).toBeNull();
    expect(await updateVpsTrustedNote("realtor", "vendor-1", "Responsive and local", connection)).toBe("listed-realtor");
    const settings = { handle: "building-team", displayName: "Building Team", brokerage: "Broker",
      headline: "Trusted local companies", contactPhone: "4165550100", contactEmail: "broker@example.test", published: true };
    expect(await updateVpsTrustedPage(member, settings, connection)).toEqual({ previousHandle: "listed-realtor" });
    expect(db.prepare("SELECT contact_phone,contact_email FROM trusted_lists").get()).toMatchObject({ contact_phone: null, contact_email: null });
    db.exec("INSERT INTO subscriptions(id,organization_id,tier,status) VALUES('pro','broker','realtor','active')");
    expect(await updateVpsTrustedPage(member, settings, connection)).toEqual({ previousHandle: "building-team" });
    expect(await toggleVpsTrustedTrade(member, "vendor-6", connection)).toMatchObject({ saved: true });
    const quote = (organizationId: string) => recordVpsTrustedQuote({ handle: settings.handle, organizationId,
      name: "Client", email: "client@example.test", message: "Please quote the repairs.", phone: "" }, connection);
    expect(await quote("vendor-6")).toEqual({ to: "vendor-6@example.test", tradeName: "Vendor 6",
      recommender: "Building Team (Broker)", cc: ["broker@example.test", "realtor@example.test"] });
    db.exec("UPDATE subscriptions SET status='canceled'");
    expect(await quote("vendor-6")).toBeNull();
    expect(await quote("vendor-1")).toMatchObject({ to: "vendor-1@example.test", cc: ["realtor@example.test"] });
    db.exec("UPDATE organizations SET status='suspended' WHERE id='vendor-1'");
    expect(await quote("vendor-1")).toBeNull();
    expect(await toggleVpsTrustedTrade(member, "vendor-1", connection)).toMatchObject({ saved: false });
    expect(await isVpsTrustedTradeSaved(member.userId, "vendor-1", connection)).toBe(false);
    expect(await updateVpsTrustedPage(member, { ...settings, published: false }, connection)).toEqual({ previousHandle: "building-team" });
    expect(await quote("vendor-2")).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM contact_requests").get()?.n).toBe(2);
  } finally {
    db.close();
  }
});

it("returns public galleries and reviews with consent and limits an open review token to its project's hero", async () => {
  const db = new DatabaseSync(":memory:");
  vi.stubEnv("PMRFP_VPS_CUSTOMER_ENGINE", "d1");
  vi.stubEnv("PMRFP_VPS_PROJECT_UPLOADS", "enabled");
  const connection = d1(db);
  const mock = vi.spyOn(vpsD1, "vpsAppDatabase").mockReturnValue({ ...connection, exec: async (sql) => {
    connection.exec(sql);
    return [];
  } });
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/private-project-files.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const organization = "c39b1570-2748-4a63-b43f-b15bc78b8881";
    const project = "b91b7c26-3f35-4328-b2bb-397eff208ca9";
    const privateProject = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const file = "b91b7c26-3f35-4328-b2bb-397eff208caa";
    const secondFile = "b91b7c26-3f35-4328-b2bb-397eff208cab";
    const token = "a".repeat(32);
    const hash = hashReviewToken(token);
    db.prepare(`INSERT INTO organizations(id,name,slug,organization_type,status,profile_status)
      VALUES(?,'Project Company','project-company','trade_company','active','approved')`).run(organization);
    const insert = db.prepare(`INSERT INTO case_studies(id,organization_id,title,slug,challenge,approach,outcome,status,visibility,photos,hero_url)
      VALUES(?,?,'Fixture',?,'Fixture','Fixture','Fixture','published',?,?,?)`);
    const photo = (projectId: string, fileId: string) => ({ url: `/api/projects/${projectId}/photo/${fileId}`,
      path: `${organization}/${fileId}.jpg`, kind: "after", width: 1, height: 1 });
    insert.run(project, organization, "public-project", "public", JSON.stringify([photo(project, file)]), photo(project, file).url);
    insert.run(privateProject, organization, "private-project", "private",
      JSON.stringify([photo(privateProject, file), photo(privateProject, secondFile)]), photo(privateProject, file).url);
    db.prepare("INSERT INTO _private_project_files VALUES(?,?,?,3)").run(photo(project, file).path, "f".repeat(64), "a".repeat(32));
    db.prepare(`INSERT INTO review_invites(id,token_hash,case_study_id,organization_id,client_name,client_email)
      VALUES('invite',?,?,?,'Reviewer','reviewer@example.test')`).run(hash, privateProject, organization);
    const review = db.prepare(`INSERT INTO vendor_reviews(id,organization_id,case_study_id,reviewer_name,reviewer_company,reviewer_email,rating,body,status,show_building)
      VALUES(?,?,?,'Jane Doe','Private Building','jane@example.test',5,'Thank you',?,?)`);
    review.run("public", organization, project, "published", 0);
    review.run("private", organization, privateProject, "published", 1);
    review.run("pending", organization, project, "pending_review", 1);
    expect(await listPublicProjects()).toMatchObject([{ slug: "public-project", heroUrl: photo(project, file).url }]);
    expect(await listOrgProjects(organization)).toMatchObject([{ slug: "public-project", heroUrl: photo(project, file).url }]);
    expect([...await heroUrlsBySlug(["public-project", "private-project"])]).toEqual([["public-project", photo(project, file).url]]);
    expect([...await ratingsBySlug(["public-project", "private-project"])]).toEqual([["public-project", { count: 1, average: 5 }]]);
    expect(await listPublishedReviews({ organizationId: organization })).toEqual([expect.objectContaining({
      caseStudyId: project, name: "Jane D.", company: null, rating: 5,
    })]);
    expect(JSON.stringify(await listPublishedReviews({ caseStudyId: project }))).not.toContain("jane@example.test");
    expect(await listPublishedReviews({ caseStudyId: privateProject })).toEqual([]);
    expect(await resolveVpsReviewPhoto(token, connection)).toEqual({ projectId: privateProject, file: `${file}.jpg`, hash });
    const object = { etag: "a".repeat(32), size: 3, httpMetadata: {contentType: "image/jpeg"},
      body: new Response(new Uint8Array([255, 216, 255])).body! };
    const store = { async get() { return object; }, async head() { return object; } };
    const fetchPhoto = (id: string, fileId: string) => handleNativeProjectPhoto(connection, store,
      new Request(`https://pmrfp.com/v1/project-photos/${id}/${fileId}.jpg`, { method: "HEAD" }), null, undefined, hash);
    expect((await fetchPhoto(privateProject, file)).status).toBe(200);
    await expect(fetchPhoto(privateProject, secondFile)).rejects.toThrow("not_found");
    await expect(fetchPhoto(project, file)).rejects.toThrow("not_found");
    db.exec("UPDATE review_invites SET used_at='2026-11-27T12:00:00Z'");
    expect(await resolveVpsReviewPhoto(token, connection)).toBeNull();
    await expect(fetchPhoto(privateProject, file)).rejects.toThrow("not_found");
  } finally {
    mock.mockRestore();
    vi.unstubAllEnvs();
    db.close();
  }
});

it("keeps Marketplace photos private until publication and scopes listings, relay and checkout to the correct seller", async () => {
  const db = new DatabaseSync(":memory:");
  const secret = "c".repeat(64);
  vi.stubEnv("PMRFP_PRIVATE_R2_GATEWAY_KEY", secret);
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/marketplace-media.sql", "utf8"));
    db.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users VALUES('seller'),('other'),('admin');
      INSERT INTO users_profile(id,email,primary_role) VALUES('seller','seller@example.test','trade'),
        ('other','other@example.test','trade'),('admin','admin@example.test','admin');`);
    const binding = d1(db);
    const jpeg = await sharp({ create: { width: 24, height: 20, channels: 3, background: "#aaaacc" } }).jpeg().toBuffer();
    const objects = new Map<string, { body: ArrayBuffer; metadata: SandboxObjectMetadata }>();
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      request.headers.set("cf-connecting-ip", "192.0.2.1");
      return privateStorage.fetch(request, {
        APP_DB: binding, VPS_IP: "192.0.2.1", MODE: "serving", GATEWAY_SECRET: secret,
        PRIVATE_FILES: {
          async head(key) { return objects.get(key)?.metadata ?? null; },
          async get(key) {
            const object = objects.get(key);
            return object ? { ...object.metadata, body: new Response(object.body).body! } : null;
          },
          async delete(key) { objects.delete(key); },
          async put(key, data, options) { objects.set(key, { body: data, metadata: { ...options, size: data.byteLength } }); },
        },
      });
    };
    const seller = { userId: "seller", hasTradeAccess: false, organization: null } as SessionContext;
    const other = { ...seller, userId: "other" };
    const image = await uploadVpsListingPhoto(seller.userId, { data: jpeg, width: 24, height: 20 }, binding, fetcher);
    const view = (userId: string | null) => serveVpsListingPhoto(image.path, userId, false, binding, fetcher);
    expect((await view(null)).status).toBe(404);
    expect((await view(other.userId)).status).toBe(404);
    expect(Buffer.from(await (await view(seller.userId)).arrayBuffer())).toEqual(jpeg);
    const input = listingSchema.parse({ title: "Pressure washer", category: "power-tools", condition: "used",
      description: "Works reliably and includes all adapters.", price: 50, priceOnRequest: false,
      photos: [{ ...image, width: 999 }], publish: false });
    const { slug } = await saveVpsListing(seller, "", input, binding);
    const record = db.prepare("SELECT id,slug,photos FROM marketplace_listings WHERE user_id='seller'").get();
    const id = String(record?.id);
    expect(record?.slug).toBe(slug);
    expect(JSON.parse(String(record?.photos))).toEqual([image]);
    expect((await view(null)).status).toBe(404);
    expect((await view("admin")).status).toBe(200);
    expect(await setVpsListingStatus(other, id, "active", binding)).toBe(false);
    expect(await setVpsListingStatus(seller, id, "active", binding)).toBe(true);
    expect((await view(null)).status).toBe(200);
    expect(await vpsFeatureListing(id, other.userId, binding)).toBeNull();
    expect(await vpsFeatureListing(id, seller.userId, binding)).toMatchObject({ id });
    const buyer = { slug: String(slug), email: "buyer@example.test", name: "Buyer", message: "Is the washer available?" };
    expect(await recordVpsMarketplaceContact(buyer, binding)).toEqual({ title: input.title, email: "seller@example.test" });
    expect(db.prepare("SELECT sender_email FROM marketplace_messages").all()).toEqual([{ sender_email: buyer.email }]);
    expect(await saveVpsListing(other, "", { ...input, publish: true }, binding)).toHaveProperty("slug");
    expect(db.prepare("SELECT photos FROM marketplace_listings WHERE user_id='other'").get()?.photos).toBe("[]");
    expect(await saveVpsListing(seller, "", { ...input, publish: true }, binding)).toHaveProperty("slug");
    expect(await saveVpsListing(seller, "", { ...input, publish: true }, binding)).toHaveProperty("slug");
    expect(await saveVpsListing(seller, "", { ...input, publish: true }, binding)).toEqual({ error: "limit" });
    await moderateVpsListing(other.userId, id, "removed", binding);
    expect((await view(null)).status).toBe(200);
    await moderateVpsListing("admin", id, "removed", binding);
    expect(await saveVpsListing(seller, id, { ...input, publish: true }, binding)).toEqual({ error: "notFound" });
    expect(await vpsFeatureListing(id, seller.userId, binding)).toBeNull();
    expect(await recordVpsMarketplaceContact(buyer, binding)).toBeNull();
    // The other active listings still reference the photo. Remove those references before checking public revocation.
    db.exec("UPDATE marketplace_listings SET photos='[]' WHERE status='active'");
    expect((await view(null)).status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
    db.close();
  }
});

it("stores company uploads in R2 and checks publication, ownership, and the free portfolio limit", async () => {
  const db = new DatabaseSync(":memory:");
  const secret = "c".repeat(64);
  vi.stubEnv("PMRFP_PRIVATE_R2_GATEWAY_KEY", secret);
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/company-media.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const user = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(user);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'trade')").run(user, "owner@fixture-roofing.ca");
    db.exec("INSERT INTO organizations(id,name,slug) VALUES('org-local','Company','company')");
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member','org-local',?,'owner')").run(user);
    const session = { userId: user, organization: { id: "org-local" } };
    const connection = d1(db);
    const objects = new Map<string, { body: ArrayBuffer; metadata: SandboxObjectMetadata }>();
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      request.headers.set("cf-connecting-ip", "192.0.2.1");
      return privateStorage.fetch(request, {
        APP_DB: connection, VPS_IP: "192.0.2.1", MODE: "serving", GATEWAY_SECRET: secret,
        PRIVATE_FILES: {
          async head(key) { return objects.get(key)?.metadata ?? null; },
          async get(key) {
            const object = objects.get(key);
            return object ? { ...object.metadata, body: new Response(object.body).body! } : null;
          },
          async delete(key) { objects.delete(key); },
          async put(key, data, options) { objects.set(key, { body: data, metadata: { ...options, size: data.byteLength } }); },
        },
      });
    };
    const unsafe = new File(["<!DOCTYPE svg><svg xmlns=\"http://www.w3.org/2000/svg\"/>"], "logo.svg", { type: "image/svg+xml" });
    await expect(normalizeCompanyMedia(unsafe, "logo")).rejects.toThrow();
    const png = await sharp({ create: { width: 25, height: 25, channels: 4, background: "#ba090990" } }).png().toBuffer();
    const data = await normalizeCompanyMedia(new File([Uint8Array.from(png)], "logo.png", { type: "image/png" }), "logo");
    expect(await sharp(data).metadata()).toMatchObject({ format: "webp", hasAlpha: true });
    const logo = await uploadCompanyMedia(session, "logo", data, connection, fetcher);
    const photo = await uploadCompanyMedia(session, "portfolio", data, connection, fetcher);
    await expect(uploadCompanyMedia(session, "portfolio", data, connection, fetcher)).rejects.toThrow();
    expect(await listCompanyPortfolio("org-local", user, connection)).toEqual([photo]);
    expect(await listCompanyPortfolio("org-local", null, connection)).toEqual([]);
    expect((await serveCompanyMedia(logo.path, false, null, connection, fetcher)).status).toBe(404);
    expect(Buffer.from(await (await serveCompanyMedia(logo.path, false, user, connection, fetcher)).arrayBuffer())).toEqual(data);
    db.prepare("UPDATE organizations SET profile_status='approved',logo_url=? WHERE id='org-local'").run(logo.url);
    expect((await serveCompanyMedia(logo.path, true, null, connection, fetcher)).status).toBe(200);
    expect(await listCompanyPortfolio("org-local", null, connection)).toEqual([photo]);
    await expect(removeCompanyPortfolioPhoto({ ...session, userId: "other" }, photo.path, connection)).rejects.toThrow();
    await removeCompanyPortfolioPhoto(session, photo.path, connection, fetcher);
    expect(objects.has(`company-media/${photo.path}`)).toBe(false);
    expect((await serveCompanyMedia(photo.path, false, null, connection, fetcher)).status).toBe(404);
    const legacy = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
    const assetId = "d".repeat(64);
    vi.stubEnv("PMRFP_PUBLIC_ASSET_GATEWAY_SECRET", secret);
    db.prepare("INSERT INTO _company_legacy_portfolio(id,organization_id,asset_id,created_at) VALUES(?,'org-local',?,1)")
      .run(legacy, assetId);
    await expect(uploadCompanyMedia(session, "portfolio", data, connection, fetcher)).rejects.toThrow();
    expect(await isLegacyPortfolioAsset(assetId, connection)).toBe(true);
    const archived: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://pmrfp-verified-public-assets-preview.pmrfp.workers.dev/v1/assets/" + assetId);
      expect(request.headers.get("x-pmrfp-asset-preview-key")).toBe(secret);
      return new Response(Uint8Array.from(png), { headers: { "content-type": "image/png" } });
    };
    const original = await serveCompanyMedia(legacy, false, null, connection, archived);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(png);
    await removeCompanyPortfolioPhoto(session, legacy, connection);
    expect((await serveCompanyMedia(legacy, false, null, connection, archived)).status).toBe(404);
    expect(await isLegacyPortfolioAsset(assetId, connection)).toBe(true);
  } finally {
    vi.unstubAllEnvs();
    db.close();
  }
});

it("uses each authenticated account's D1 data and revokes access on suspension or logout", async () => {
  const auth = new DatabaseSync(":memory:");
  const app = new DatabaseSync(":memory:");
  const origin = "https://customer-auth.test";
  const gateway = "customer-auth-gateway-secret-local-only";
  const env = { MODE: "customer-staging", AUTH_ORIGIN: origin, GATEWAY_SECRET: gateway,
    AUTH_SECRET: "customer-auth-cookie-secret-local-only", AUTH_DB: d1(auth), APP_DB: d1(app) };
  const a = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
  const b = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
  const date = "2026-11-09T00:00:00Z";
  const accounts = [a, b].map((id, index) => mapMigrationAccount({
    id, email: `customer-${index}@example.test`,
    // bcrypt("password") for this local database only.
    encrypted_password: "$2b$04$RXFyXBpvg9QIpAYYeYvt6OOBYevqzrE/j2UVrabDQSn4ofyivnHKK",
    email_confirmed_at: date, phone: null, phone_confirmed_at: null, created_at: date, updated_at: date,
    banned_until: null, deleted_at: null, is_anonymous: false, is_sso_user: false,
    raw_user_meta_data: { role: "super_admin" }, raw_app_meta_data: {},
  }));
  const schema = readFileSync("workers/auth-preview/schema.sql", "utf8").split("-- Explicit sandbox marker")[0];
  const snapshot = { accounts, records: 2, sourceSha256: "a".repeat(64) };
  for (const { sql, params } of customerAuthBootstrap(snapshot, schema)) {
    auth.prepare(sql).run(...params);
  }
  const call = (path: string, body?: object, cookie?: string) => handleCustomerAuth(new Request(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "x-pmrfp-auth-gateway": gateway, ...(cookie ? { cookie } : {}),
      ...(body ? { origin, "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  try {
    expect((await call("/api/auth/get-session")).status).toBe(503);
    auth.prepare("UPDATE _auth_customer_staging SET verified_at=?").run(new Date().toISOString());
    app.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    for (const [index, id] of [a, b].entries()) {
      app.prepare("INSERT INTO _auth_users VALUES (?)").run(id);
      app.prepare("INSERT INTO users_profile(id,email,full_name,primary_role,onboarding_completed) VALUES(?,?,?,'trade',1)")
        .run(id, accounts[index].user.email, `Customer ${index}`);
      app.prepare("INSERT INTO organizations(id,name,slug) VALUES(?,?,?)").run(`org-${index}`, `Company ${index}`, `company-${index}`);
      app.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')")
        .run(`member-${index}`, `org-${index}`, id);
    }
    app.exec("INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('sub','org-0','active','pro')");
    app.exec("INSERT INTO rfp_posts(id,title,slug,status,keep_alive_token) VALUES('rfp','Published Listing','published-listing','published','local-only')");
    app.prepare("INSERT INTO saved_rfps(id,user_id,rfp_id) VALUES('save',?,'rfp')").run(a);
    const logIn = async (index: number) => {
      const response = await call("/api/auth/sign-in/email", { email: accounts[index].user.email, password: "password" });
      expect(response.status).toBe(200);
      return response.headers.getSetCookie().find(cookie => cookie.startsWith("__Secure-better-auth.session_token="))!.split(";")[0];
    };
    const [cookieA, cookieB] = await Promise.all([logIn(0), logIn(1)]);
    const profile = (cookie: string) => call("/api/auth/get-session", undefined, cookie);
    expect(await (await profile(cookieA)).json()).toMatchObject({ userId: a, profile: { primary_role: "trade" }, organization: { name: "Company 0" }, hasTradeAccess: true });
    expect(await (await profile(cookieB)).json()).toMatchObject({ userId: b, organization: { name: "Company 1" }, hasTradeAccess: false });
    expect(await (await call("/v1/saved-rfps", undefined, cookieA)).json()).toMatchObject({ items: [{ slug: "published-listing" }] });
    expect(await (await call("/v1/saved-rfps", undefined, cookieB)).json()).toEqual({ items: [] });
    expect((await call("/v1/saved-rfps?userId=" + a, undefined, cookieB)).status).toBe(404);
    expect((await call("/v1/saved-rfps", { rfpSlug: "published-listing", action: "unsave" }, cookieA)).status).toBe(200);
    expect(await (await call("/v1/saved-rfps", undefined, cookieA)).json()).toEqual({ items: [] });
    expect((await call("/v1/saved-rfps", { rfpSlug: "published-listing", action: "save" }, cookieB)).status).toBe(200);
    expect(await (await call("/v1/saved-rfps", undefined, cookieB)).json()).toMatchObject({ items: [{ slug: "published-listing" }] });
    expect(app.prepare("SELECT user_id FROM saved_rfps").get()?.user_id).toBe(a);
    app.prepare("UPDATE users_profile SET status='suspended' WHERE id=?").run(a);
    expect((await profile(cookieA)).status).toBe(403);
    const rotated = { ...accounts[0], account: { ...accounts[0].account, password: accounts[0].account.password.replace(/.$/, "Z") } };
    const next = { ...snapshot, accounts: [rotated, accounts[1]], sourceSha256: "b".repeat(64) };
    auth.exec("BEGIN");
    for (const { sql, params } of refreshCustomerAuthStatements(snapshot, next)) auth.prepare(sql).run(...params);
    auth.exec("COMMIT");
    auth.prepare("UPDATE _auth_customer_staging SET verified_at=?").run(new Date().toISOString());
    expect((await profile(cookieA)).status).toBe(401);
    expect(await (await call("/v1/saved-rfps", undefined, cookieB)).json()).toMatchObject({ items: [{ slug: "published-listing" }] });
    expect(auth.prepare("SELECT count(*) AS n FROM _staging_saved_rfps").get()?.n).toBe(2);
    expect((await call("/api/auth/sign-out", {}, cookieB)).status).toBe(200);
    expect((await profile(cookieB)).status).toBe(401);
  } finally {
    auth.close();
    app.close();
  }
});

it("allows one native password reset after the source mirror is retired and revokes old sessions", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const origin = "https://recovery-fixture.test";
    const gateway = "account-recovery-gateway-fixture-only";
    const environment = { MODE: "customer-native", AUTH_ORIGIN: origin, GATEWAY_SECRET: gateway,
      AUTH_SECRET: "account-recovery-cookie-fixture-only", AUTH_DB: d1(db), APP_DB: d1(db) };
    const schema = readFileSync("workers/auth-preview/schema.sql", "utf8").split("-- Explicit sandbox marker")[0];
    db.exec(schema);
    db.exec(readFileSync("deploy/vps/customer-auth-authority.sql", "utf8"));
    db.exec("INSERT INTO _auth_customer_staging VALUES(1,'customer-staging-v1','fixture',1,NULL)");
    const user = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const email = "account-recovery@example.test";
    const oldHash = "$2b$04$RXFyXBpvg9QIpAYYeYvt6OOBYevqzrE/j2UVrabDQSn4ofyivnHKK";
    db.prepare("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned) VALUES(?,'Local customer',?,1,1,1,'user',0)").run(user,email);
    db.prepare("INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,1,1)").run("credential:"+user,user,user,oldHash);
    db.prepare("INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES('before','old-session-token',?,'2099-01-01',1,1)").run(user);
    const post = (path: string, body: object, key = gateway) => handleCustomerAuth(new Request(origin + path, {
      method: "POST", headers: { "x-pmrfp-auth-gateway": key, origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }), environment);
    const requestReset = "/v1/account/reset-request";
    const reset = "/v1/account/reset";
    expect((await post(requestReset,{ email },"wrong")).status).toBe(401);
    expect((await post(requestReset,{ email })).status).toBe(503);
    db.exec("INSERT INTO _auth_native_authority VALUES(1,'native-v1')");
    expect((await post(requestReset,{ email })).status).toBe(503);
    db.exec("DELETE FROM _auth_customer_staging");
    const requestLink = "/v1/account/login-link-request";
    const finishLink = "/v1/account/login-link";
    const proof = "a".repeat(64);
    expect(await (await post(requestLink, { email: "missing@example.test", proof })).json()).toEqual({ token: null });
    const { token: earlierLink } = await (await post(requestLink, { email, proof })).json();
    const { token: signInLink } = await (await post(requestLink, { email, proof })).json();
    expect(signInLink).toMatch(/^[a-f0-9]{64}$/);
    expect(db.prepare("SELECT count(*) AS n FROM verification WHERE instr(identifier,?) OR instr(value,?)")
      .get(signInLink, signInLink)?.n).toBe(0);
    expect((await post(finishLink, { token: earlierLink, proof })).status).toBe(401);
    expect((await post(finishLink, { token: signInLink, proof: "b".repeat(64) })).status).toBe(401);
    const concurrent = await Promise.all([post(finishLink, { token: signInLink, proof }), post(finishLink, { token: signInLink, proof })]);
    expect(concurrent.map(response => response.status).sort()).toEqual([204, 401]);
    const linkCookie = concurrent.find(response => response.status === 204)?.headers.getSetCookie()[0];
    expect(linkCookie).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(db.prepare("SELECT count(*) AS n FROM session WHERE userId=?").get(user)?.n).toBe(2);
    const { token: suspendedLink } = await (await post(requestLink, { email, proof })).json();
    db.prepare("UPDATE user SET banned=1 WHERE id=?").run(user);
    expect((await post(finishLink, { token: suspendedLink, proof })).status).toBe(401);
    db.prepare("UPDATE user SET banned=0 WHERE id=?").run(user);
    expect(await (await post(requestReset,{ email:"missing@example.test" })).json()).toEqual({ token:null });
    const { token:superseded } = await (await post(requestReset,{ email })).json();
    const { token } = await (await post(requestReset,{ email })).json();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(db.prepare("SELECT token_hash FROM _auth_password_resets").get()?.token_hash).not.toBe(token);
    const password = "Changed-only-in-local-fixture";
    expect((await post(reset,{ token:superseded,password })).status).toBe(400);
    db.exec("CREATE TRIGGER fail_reset BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT,'local failure'); END");
    expect((await post(reset,{token,password})).status).toBe(503);
    expect(db.prepare("SELECT password FROM account").get()?.password).toBe(oldHash);
    expect(db.prepare("SELECT count(*) AS n FROM _auth_password_resets").get()?.n).toBe(1);
    db.exec("DROP TRIGGER fail_reset");
    expect(await (await post(reset,{token,password})).json()).toEqual({ok:true});
    expect(db.prepare("SELECT count(*) AS n FROM session").get()?.n).toBe(0);
    expect((await post(reset,{token,password})).status).toBe(400);
    expect((await post("/api/auth/sign-in/email",{ email,password:"password" })).status).toBe(401);
    expect((await post("/api/auth/sign-in/email",{ email,password })).status).toBe(200);
    db.prepare("UPDATE user SET emailVerified=0 WHERE id=?").run(user);
    expect(await (await post(requestReset,{email})).json()).toEqual({token:null});
    db.prepare("INSERT INTO _auth_source_metadata(user_id,metadata) VALUES(?,'{}')").run(user);
    const {token: confirmation} = await (await post(requestReset,{email})).json();
    expect(confirmation).toMatch(/^[a-f0-9]{64}$/);
    expect((await post("/api/auth/sign-in/email",{email,password})).status).toBe(403);
    const newPassword = "Confirmed-mailbox-in-local-fixture";
    expect((await post(reset,{token:confirmation,password:newPassword})).status).toBe(200);
    expect(db.prepare("SELECT emailVerified FROM user WHERE id=?").get(user)?.emailVerified).toBe(1);
    expect((await post("/api/auth/sign-in/email",{email,password})).status).toBe(401);
    expect((await post("/api/auth/sign-in/email",{email,password:newPassword})).status).toBe(200);
  } finally {
    db.close();
  }
});

it("verifies a native password signup and can finish it after an application-profile failure", async () => {
  const auth = new DatabaseSync(":memory:");
  const app = new DatabaseSync(":memory:");
  try {
    auth.exec(readFileSync("workers/auth-preview/schema.sql","utf8").split("-- Explicit sandbox marker")[0]);
    auth.exec(readFileSync("deploy/vps/customer-auth-authority.sql","utf8"));
    auth.exec("INSERT INTO _auth_native_authority VALUES(1,'native-v1')");
    app.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql","utf8"));
    app.exec(readFileSync("deploy/vps/customer-app-authority.sql","utf8"));
    const origin = "https://signup-fixture.test";
    const gateway = "account-signup-gateway-fixture-only";
    const env = {
      PMRFP_VPS_CUSTOMER_ENGINE: "d1",
      PMRFP_CUSTOMER_AUTH_ORIGIN: origin,
      PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET: gateway,
      PMRFP_CUSTOMER_AUTH_SESSION_SECRET: "account-signup-cookie-fixture-only",
      PMRFP_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      PMRFP_D1_AUTH_DATABASE_ID: "b91b7c26-3f35-4328-b2bb-397eff208ca7",
      PMRFP_D1_APP_DATABASE_ID: "e5952844-51ad-4ff4-9632-b25ef0ba6759",
      PMRFP_D1_RUNTIME_TOKEN: "local-test-token-that-does-not-allow-real-access",
      PMRFP_PRIVATE_R2_GATEWAY_KEY: "b".repeat(64),
    };
    let readsFromR2 = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === "https://pmrfp-private-project-files.pmrfp.workers.dev") {
        readsFromR2++;
        expect(request.headers.get("x-pmrfp-gateway-key")).toBe(env.PMRFP_PRIVATE_R2_GATEWAY_KEY);
        expect(request.headers.get("cookie")).toBeNull();
        expect(url.pathname).toBe(`/v1/private-project-files/${"f".repeat(64)}`);
        return new Response(new Uint8Array([255, 216, 255]), {
          headers: { "content-type": "image/jpeg", "content-length": "3", etag: `"${"a".repeat(32)}"` },
        });
      }
      expect(request.headers.get("authorization")).toBe(`Bearer ${env.PMRFP_D1_RUNTIME_TOKEN}`);
      const authPath = `/accounts/${env.PMRFP_CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.PMRFP_D1_AUTH_DATABASE_ID}/query`;
      const appPath = `/accounts/${env.PMRFP_CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.PMRFP_D1_APP_DATABASE_ID}/query`;
      expect(url.origin).toBe("https://api.cloudflare.com");
      expect([authPath, appPath].map(path => "/client/v4" + path)).toContain(url.pathname);
      const db = url.pathname.endsWith(authPath) ? auth : app;
      type Query = { sql: string; params: (string | number | null)[] };
      const payload = await request.json() as Query | { batch: Query[] };
      const queries = "batch" in payload ? payload.batch : [payload];
      db.exec("BEGIN");
      try {
        const result = queries.map(({ sql, params }) => {
          const results = db.prepare(sql).all(...params);
          const meta = { changes: Number(db.prepare("SELECT changes() AS n").get()?.n) };
          return { success: true, results, meta };
        });
        db.exec("COMMIT");
        return Response.json({ success: true, result });
      } catch {
        db.exec("ROLLBACK");
        return Response.json({ success: false }, { status: 400 });
      }
    };
    const post = (path: string, body: object) => callVpsCustomer(new Request(origin+path,{
      method:"POST",headers:{"x-pmrfp-auth-gateway":gateway,origin,"content-type":"application/json"},
      body:JSON.stringify(body),
    }),env,fetcher);
    const input = { email:"sample.person+verify@gmail.com",password:"Local-fixture-only-password",
      fullName:"Local Signup",role:"supplier",lang:"fr",
      preferences:{pref_categories:["roofing"],pref_regions:["toronto"],pref_company:"Fixture Supply"} };
    const requestPath="/v1/account/signup-request";
    const resendPath="/v1/account/signup-resend";
    const confirmPath="/v1/account/signup-confirm";
    const confirm=(token: string) => post(confirmPath,{token,password:input.password});
    expect((await post(requestPath,input)).status).toBe(503);
    app.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    expect((await post(requestPath,{...input,role:"admin"})).status).toBe(400);
    const {token} = await (await post(requestPath,input)).json();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await (await post(resendPath,{email:input.email})).json()).toEqual({token:null});
    auth.prepare("UPDATE _auth_pending_signup SET expires_at=?").run(Date.now() - 1000);
    expect(await (await post(resendPath,{email:"sampleperson@googlemail.com"})).json()).toEqual({token:null});
    const resend = () => post(resendPath,{email:input.email}).then(response => response.json());
    const resendResults = await Promise.all([resend(), resend()]);
    const replacement = resendResults.find(result => result.token)?.token;
    expect(resendResults.filter(result => result.token)).toHaveLength(1);
    expect(replacement).toMatch(/^[a-f0-9]{64}$/);
    expect(replacement).not.toBe(token);
    expect((await confirm(token)).status).toBe(400);
    expect(auth.prepare("SELECT count(*) AS n FROM user").get()?.n).toBe(0);
    expect((await confirm("0".repeat(64))).status).toBe(400);
    app.exec("CREATE TRIGGER fail_profile BEFORE INSERT ON users_profile BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    expect((await confirm(replacement)).status).toBe(503);
    expect(app.prepare("SELECT count(*) AS n FROM _auth_users").get()?.n).toBe(0);
    expect(auth.prepare("SELECT confirmed FROM _auth_pending_signup").get()?.confirmed).toBe(1);
    app.exec("DROP TRIGGER fail_profile");
    expect(await (await confirm(replacement)).json()).toEqual({ok:true});
    const stored=auth.prepare("SELECT id,emailVerified FROM user").get();
    expect(stored?.emailVerified).toBe(1);
    expect(app.prepare("SELECT id,primary_role FROM users_profile").get()).toMatchObject({id:stored?.id,primary_role:"supplier"});
    expect(app.prepare("SELECT scope,lang FROM email_consents").get()).toMatchObject({scope:"service",lang:"fr"});
    expect((await confirm(replacement)).status).toBe(400);
    expect(await resend()).toEqual({token:null});
    expect(await (await post(requestPath,{...input,email:"sampleperson@googlemail.com"})).json()).toEqual({token:null});
    const login = await post("/api/auth/sign-in/email",{email:input.email,password:input.password});
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().find(value => value.startsWith("__Secure-better-auth.session_token="))!.split(";")[0];
    const readPrefs = () => callVpsCustomer(new Request(origin+"/v1/account/signup-preferences",{
      headers:{"x-pmrfp-auth-gateway":gateway,cookie},
    }),env,fetcher);
    expect(await (await readPrefs()).json()).toMatchObject({primary_role:"supplier",...input.preferences});
    const onboardingPath = "/v1/account/onboarding";
    const submit = (body: object, session = cookie) => callVpsCustomer(new Request(origin+onboardingPath,{
      method:"POST",headers:{"x-pmrfp-auth-gateway":gateway,origin,"content-type":"application/json",cookie:session},
      body:JSON.stringify(body),
    }),env,fetcher);
    const company = { name:"Fixture Supply", website:"https://supplier.example.test", phone:"416 555 0100",
      email:input.email, province:"Ontario", city:"Toronto", publicContactVisibility:"request_intro",
      categories:["roofing"],regions:["toronto"] };
    const setup = { lang:"fr",marketing:true,weeklyEmail:true,browsing:false,buyerKind:null,acknowledged:[],company };
    expect((await submit(setup,"")).status).toBe(401);
    expect((await submit({...setup,userId:stored?.id})).status).toBe(400);
    expect((await submit(setup)).status).toBe(503);
    expect(app.prepare("SELECT count(*) AS n FROM organizations").get()?.n).toBe(0);
    expect(app.prepare("SELECT onboarding_completed FROM users_profile").get()?.onboarding_completed).toBe(0);
    app.exec(`INSERT INTO trade_categories(id,name,slug) VALUES('roof','Roofing','roofing');
      INSERT INTO regions(id,name,slug) VALUES('tor','Toronto','toronto');
      INSERT INTO organizations(id,name,slug,website,organization_type,profile_status)
      VALUES('1d12ae17-bc7e-4b28-b54f-55c819b40887','Fixture Supply','existing-supplier',
        'https://supplier.example.test','supplier','approved');`);
    const matches = await (await submit(setup)).json();
    expect(matches.duplicates).toMatchObject([{slug:"existing-supplier",listed:true}]);
    expect(matches.duplicates[0]).not.toHaveProperty("website");
    const acknowledged = {...setup,acknowledged:[matches.duplicates[0].id]};
    app.exec(`CREATE TRIGGER reject_consent BEFORE INSERT ON email_consents WHEN NEW.scope='marketing'
      BEGIN SELECT RAISE(ABORT,'local consent failure'); END;`);
    expect((await submit(acknowledged)).status).toBe(503);
    expect(app.prepare("SELECT count(*) AS n FROM organizations").get()?.n).toBe(1);
    expect(app.prepare("SELECT count(*) AS n FROM digest_subscribers").get()?.n).toBe(0);
    app.exec("DROP TRIGGER reject_consent");
    expect(await (await submit(acknowledged)).json()).toEqual({ok:true,alreadyComplete:false});
    expect(await (await submit(acknowledged)).json()).toEqual({ok:true,alreadyComplete:true});
    expect(app.prepare("SELECT email,status,source,consent_text_version,province,trades,lang,user_id FROM digest_subscribers").all())
      .toEqual([{email:input.email,status:"active",source:"onboarding",consent_text_version:"member-v1-2026-11",
        province:"Ontario",trades:'["roofing"]',lang:"fr",user_id:stored?.id}]);
    expect(app.prepare("SELECT role FROM organization_members").get()?.role).toBe("owner");
    expect(app.prepare("SELECT category_id FROM organization_categories").get()?.category_id).toBe("roof");
    expect(app.prepare("SELECT region_id FROM organization_regions").get()?.region_id).toBe("tor");
    expect(app.prepare("SELECT onboarding_completed FROM users_profile").get()?.onboarding_completed).toBe(1);
    expect(app.prepare("SELECT count(*) AS n FROM duplicate_reviews").get()?.n).toBe(1);

    const member = app.prepare("SELECT id, organization_id, user_id, role FROM organization_members").get() as
      { id: string; organization_id: string; user_id: string; role: string } | undefined;
    if (!member) throw new Error("Missing fixture membership");
    const organization = member.organization_id;
    const project = "b91b7c26-3f35-4328-b2bb-397eff208ca9";
    const file = "b91b7c26-3f35-4328-b2bb-397eff208caa";
    const photoPath = `${organization}/${file}.jpg`;
    app.exec(readFileSync("deploy/vps/private-project-files.sql", "utf8"));
    app.prepare("INSERT INTO _private_project_files VALUES (?, ?, ?, ?)").run(photoPath, "f".repeat(64), "a".repeat(32), 3);
    app.prepare(`INSERT INTO case_studies(id,organization_id,title,slug,challenge,approach,outcome,status,visibility,photos)
      VALUES(?,?,'Fixture','fixture','Fixture','Fixture','Fixture','published','private',?)`)
      .run(project, organization ?? "", JSON.stringify([{
        url: `https://tumexryzbzmtijvbloch.supabase.co/storage/v1/object/authenticated/project-photos-private/${photoPath}`,
        path: photoPath, kind: "after", width: 1, height: 1,
      }]));
    const download = (session?: string) => callVpsCustomer(new Request(`${origin}/v1/project-photos/${project}/${file}.jpg`, {
      headers: { "x-pmrfp-auth-gateway": gateway, ...(session ? { cookie: session } : {}) },
    }), env, fetcher);
    expect((await download()).status).toBe(401);
    expect(readsFromR2).toBe(0);
    const photo = await download(cookie);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("cache-control")).toBe("private, no-store");
    expect([...new Uint8Array(await photo.arrayBuffer())]).toEqual([255, 216, 255]);
    app.prepare("DELETE FROM organization_members WHERE id=?").run(member.id);
    expect((await download(cookie)).status).toBe(404);
    expect(readsFromR2).toBe(1);
    app.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,?)")
      .run(member.id, member.organization_id, member.user_id, member.role);

    // An imported account that received the source's default trade role can choose once.
    app.exec("UPDATE users_profile SET primary_role='trade',onboarding_completed=0");
    auth.exec("UPDATE _auth_source_metadata SET metadata='{\"raw_user_meta_data\":{}}'");
    const pick = (role: string) => callVpsCustomer(new Request(origin+"/v1/account/choose-role",{
      method:"POST", headers:{"x-pmrfp-auth-gateway":gateway,origin,"content-type":"application/json",cookie},
      body:JSON.stringify({role,award:null}),
    }),env,fetcher);
    expect((await pick("admin")).status).toBe(400);
    expect((await pick("landlord")).status).toBe(200);
    expect((await pick("supplier")).status).toBe(200);
    expect(await (await readPrefs()).json()).toMatchObject({primary_role:"property_manager",org_kind:"landlord"});
    expect(app.prepare("SELECT primary_role FROM users_profile").get()?.primary_role).toBe("property_manager");
  } finally {
    app.close();
    auth.close();
  }
});

it("lets a current owner decide a D1 join request exactly once and rolls back partial approval", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const connection = d1(db);
    const actor = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const applicant = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
    for (const id of [actor, applicant]) {
      db.prepare("INSERT INTO _auth_users VALUES(?)").run(id);
      db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'trade')").run(id, id + "@example.test");
    }
    db.exec("INSERT INTO organizations(id,name,slug) VALUES('org-test','Example company','company')");
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('owner','org-test',?,'owner')").run(actor);
    const input = { organizationId: "org-test", userId: applicant, reasons: ["name"] };
    const created = await createVpsJoinRequest(input, connection);
    if (!created.ok) throw new Error(created.reason);
    expect(await readVpsPendingJoin(applicant, connection)).toMatchObject({ id: created.id, companyName: "Example company" });
    expect(await listVpsJoinRequests("org-test", applicant, connection)).toBeNull();
    expect(await listVpsJoinRequests("org-test", actor, connection)).toHaveLength(1);
    expect(await createVpsJoinRequest(input, connection)).toEqual({ ok: false, reason: "already_pending" });
    expect(await cancelVpsJoinRequest(created.id, actor, connection)).toBe(false);
    expect(await decideVpsJoinRequest(created.id, applicant, true, connection)).toEqual({ ok: false, reason: "forbidden" });
    db.exec("CREATE TRIGGER no_member BEFORE INSERT ON organization_members BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    await expect(decideVpsJoinRequest(created.id, actor, true, connection)).rejects.toThrow();
    expect(await readVpsPendingJoin(applicant, connection)).toMatchObject({ id: created.id });
    db.exec("DROP TRIGGER no_member");
    expect(await decideVpsJoinRequest(created.id, actor, true, connection)).toEqual({ ok: true, status: "approved" });
    expect(await decideVpsJoinRequest(created.id, actor, false, connection)).toEqual({ ok: false, reason: "not_pending" });
    expect(db.prepare("SELECT role FROM organization_members WHERE user_id=?").get(applicant)).toEqual({ role: "member" });
    expect(db.prepare("SELECT onboarding_completed FROM users_profile WHERE id=?").get(applicant)).toEqual({ onboarding_completed: 1 });
    expect(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n).toBe(2);
    expect(db.prepare("SELECT count(*) AS n FROM audit_logs").get()?.n).toBe(2);
  } finally {
    db.close();
  }
});

it("uses current D1 entitlement for private tender detail and keeps public issuer links limited to published external notices", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const user = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const rfp = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
    const connection = d1(db);
    db.prepare("INSERT INTO _auth_users VALUES(?)").run(user);
    db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'trade')").run(user, "trade@example.test");
    db.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Example company','example-company')");
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member','org',?,'owner')").run(user);
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,status,scope,contact_email,source_type,source_url,keep_alive_token)
      VALUES(?,'Contract scope','contract-scope','published','Private scope','buyer@example.test','public_source','https://example.test/tender','local-token')`).run(rfp);
    expect(await readVpsRfpDetail("contract-scope", user, connection)).toBeNull();
    expect(await readVpsPublicTenderUrl("contract-scope", connection)).toBe("https://example.test/tender");
    db.exec("INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('sub','org','active','seo')");
    expect(await readVpsRfpDetail("contract-scope", user, connection)).toBeNull();
    db.exec("UPDATE subscriptions SET tier='pro'");
    const payment = await readVpsRfpDetail("contract-scope", user, connection);
    expect(payment?.item).toMatchObject({ id: rfp, scope: "Private scope", contact_email: "buyer@example.test" });
    expect(payment?.item).not.toHaveProperty("keep_alive_token");
    db.exec("UPDATE subscriptions SET status='canceled'");
    expect(await readVpsRfpDetail("contract-scope", user, connection)).toBeNull();
    db.exec("UPDATE subscriptions SET status='active'; UPDATE users_profile SET status='suspended'");
    expect(await readVpsRfpDetail("contract-scope", user, connection)).toBeNull();
    db.exec("UPDATE rfp_posts SET status='closed'");
    expect(await readVpsPublicTenderUrl("contract-scope", connection)).toBeNull();
  } finally {
    db.close();
  }
});

it("records a native response and its notification once, rolls back on failure, and enforces the current free allowance", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    db.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    db.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const buyer = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
    const supplier = "e5952844-51ad-4ff4-9632-b25ef0ba6759";
    const rfp = "a910c237-a6cf-423a-ad19-291a884fed01";
    const binding = d1(db);
    for (const id of [buyer, supplier]) {
      db.prepare("INSERT INTO _auth_users VALUES(?)").run(id);
      db.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)")
        .run(id, id + "@example.test", id === buyer ? "property_manager" : "trade");
    }
    db.exec(`INSERT INTO organizations(id,name,slug,profile_status) VALUES('supplier','Fixture Roofing','fixture-roofing','approved')`);
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member','supplier',?,'owner')").run(supplier);
    for (let i = 0; i < 2; i++) {
      db.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,posted_by_user_id,keep_alive_token)
        VALUES(?,'Local listing',?,'published','property_manager_direct',?,?)`).run(i ? "second" : rfp, i ? "second" : "local-listing", buyer, "token-" + i);
    }
    const session = { userId: supplier, organization: {
      id: "supplier", organization_type: "trade_company", status: "active", profile_status: "approved",
    } } as SessionContext;
    const data = interestSchema.parse({ rfpId: rfp, message: "Fixture response", acceptDisclaimer: true, quoteAmount: 1500.27 });
    db.exec("CREATE TRIGGER fail_interest_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'fixture'); END");
    await expect(submitVpsRfpInterest(session, data, binding)).rejects.toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM rfp_interests").get()?.n).toBe(0);
    db.exec("DROP TRIGGER fail_interest_notice");
    expect(await readVpsRfpRespondState("local-listing", session, binding)).toMatchObject({ free: true, already: null });
    expect(await submitVpsRfpInterest(session, data, binding)).toMatchObject({ ok: true, allowance: { left: 2 } });
    expect(db.prepare("SELECT CAST(quote_amount AS REAL) AS amount FROM rfp_interests").get()?.amount).toBe(1500.27);
    expect(await submitVpsRfpInterest(session, data, binding)).toEqual({ ok: false, reason: "already" });
    expect(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n).toBe(1);
    expect(await readVpsRfpRespondState("local-listing", session, binding)).toMatchObject({ already: expect.any(String) });
    expect(await readVpsInterestHistory(session, binding)).toMatchObject({ used: 1,
      interests: [{ rfp_id: rfp, job: { slug: "local-listing" }, contact: null }],
    });
    db.exec("UPDATE rfp_interests SET pm_contact_shared=1");
    expect(await readVpsInterestHistory(session, binding)).toMatchObject({ interests: [{ contact: { email: buyer + "@example.test" } }] });
    expect(await readVpsInterestHistory({ ...session, userId: buyer }, binding)).toEqual({ used: null, interests: [] });
    db.prepare("INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,used_free_allowance) VALUES('fixture-other','second','supplier',1)").run();
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,posted_by_user_id,keep_alive_token)
      VALUES('third','Local listing','third','published','property_manager_direct',?,'token-third')`).run(buyer);
    db.prepare("INSERT INTO rfp_interests(id,rfp_id,trade_organization_id,used_free_allowance) VALUES('fixture-third','third','supplier',1)").run();
    db.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,posted_by_user_id,keep_alive_token)
      VALUES('fourth','Local listing','fourth','published','property_manager_direct',?,'token-fourth')`).run(buyer);
    expect(await submitVpsRfpInterest(session, { ...data, rfpId: "fourth" }, binding)).toEqual({ ok: false, reason: "limit" });
  } finally {
    db.close();
  }
});
