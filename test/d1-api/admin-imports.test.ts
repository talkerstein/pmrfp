import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { POST as importAwards } from "@/app/api/admin/award-history/upload/route";
import { POST as importTenders } from "@/app/api/admin/canadabuys/upload/route";
import { POST as importProjects } from "@/app/api/admin/major-projects/upload/route";
import { filesFor } from "@/lib/tenders/canadabuys-upload";
import { MAX_UPLOAD_BYTES } from "@/lib/major-projects/upload";

const { actor } = vi.hoisted(() => ({
  actor: { userId: "447366a1-8d48-4343-8121-01926b7a5659", profile: { primary_role: "admin", status: "active" } },
}));
vi.mock("@/lib/access/access", () => ({ getSession: async () => actor, isAdminRole: (value: string) => value === "admin" }));
vi.mock("next/cache", async (importOriginal) => ({ ...await importOriginal<typeof import("next/cache")>(), revalidateTag: vi.fn() }));

function upload(path: string, body: string, origin = "https://pmrfp.com", size?: number) {
  return new Request(`https://pmrfp.com/api/admin/${path}`, {
    method: "POST", body: new Uint8Array(gzipSync(body)),
    headers: { origin, "content-type": "application/octet-stream", ...(size ? { "content-length": String(size) } : {}) },
  });
}

it("runs dry runs, authorizes uploads, and writes each manual feed through D1 without a Supabase client", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO _auth_users VALUES('${actor.userId}');
      INSERT INTO users_profile(id,email,primary_role) VALUES('${actor.userId}','admin@example.test','admin');
      INSERT INTO regions(id,name,slug) VALUES('can','Canada','canada'),('on','Ontario','ontario');
      INSERT INTO trade_categories(id,name,slug) VALUES('hvac','HVAC','hvac');`);
    vi.stubEnv("PMRFP_VPS_LIVE_AUTH", "enabled");
    vi.stubEnv("PMRFP_VPS_D1_TRANSPORT_KEY", "a".repeat(64));
    vi.stubGlobal("fetch", vi.fn(async (_url: string, request: RequestInit) => {
      const input = JSON.parse(String(request.body));
      const queries = (input.batch ?? [input]) as { sql: string; params: (string | number | null)[] }[];
      sqlite.exec("BEGIN");
      try {
        const result = queries.map(({ sql, params }) => {
          const results = sqlite.prepare(sql).all(...params);
          const changes = /^SELECT/i.test(sql) ? 0 : Number(sqlite.prepare("SELECT changes() AS n").get()?.n);
          return { success: true, results, meta: { changes } };
        });
        sqlite.exec("COMMIT");
        return Response.json({ success: true, result });
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }));
    const today = new Date().toISOString().slice(0, 10);
    const award = [
      "title-titre-eng,referenceNumber-numeroReference,contractAwardDate-dateAttributionContrat,contractAmount-montantContrat,contractCurrency-contratMonnaie,procurementCategory-categorieApprovisionnement,supplierLegalName-nomLegalFournisseur-eng,contractingEntityName-nomEntitContractante-eng",
      `Furnace Replacements,cb-local-award,${today},400000,CAD,SRV,Fixture Mechanical Ltd,Public Works`,
    ].join("\n");
    const awardPath = "award-history/upload?source=ca-canadabuys-awards";
    expect((await importAwards(upload(awardPath, award, "https://invalid.example"))).status).toBe(403);
    expect((await importAwards(upload(awardPath, award, "https://pmrfp.com", MAX_UPLOAD_BYTES + 1))).status).toBe(413);
    const awardDry = await importAwards(upload(awardPath + "&dry=1", award));
    expect(await awardDry.json()).toMatchObject({ dry: true, kept: 1 });
    expect(sqlite.prepare("SELECT count(*) AS total FROM award_history").get()?.total).toBe(0);
    const awardWrite = await importAwards(upload(awardPath, award));
    expect(await awardWrite.json()).toMatchObject({ dry: false, written: { upserted: 1 } });
    expect(sqlite.prepare("SELECT title FROM award_history").get()?.title).toBe("Furnace Replacements");

    const tender = JSON.stringify({
      kind: "open",
      files: filesFor("open", today),
      rows: [{
        "title-titre-eng": "Furnace Replacements",
        "referenceNumber-numeroReference": "cb-local-tender",
        "tenderClosingDate-appelOffresDateCloture": new Date(Date.now() + 7 * 86_400_000).toISOString(),
        "procurementCategory-categorieApprovisionnement": "*SRV",
        "noticeType-avisType-eng": "Request for Proposal",
        "regionsOfDelivery-regionsLivraison-eng": "*Ontario (except NCR)",
        "noticeURL-URLavis-eng": "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/cb-local-tender",
      }],
    });
    expect((await importTenders(upload("canadabuys/upload?dry=1", tender))).status).toBe(200);
    expect(sqlite.prepare("SELECT count(*) AS total FROM rfp_posts").get()?.total).toBe(0);
    expect((await importTenders(upload("canadabuys/upload", tender))).status).toBe(200);
    expect(sqlite.prepare("SELECT title FROM rfp_posts").get()?.title).toBe("Furnace Replacements");

    const projects = "PROJECT_NUMBER,PROJECT_TITLE,TOTAL_ELIGIBLE_COST,REGION_CD,STANDARD_CATEGORY\nlocal-project,Town Water Upgrades,20000000,ON,Drinking Water";
    const projectPath = "major-projects/upload?source=infrastructure-canada";
    const projectDry = await importProjects(upload(projectPath + "&dry=1", projects));
    expect(await projectDry.json()).toMatchObject({ dry: true, parsed: 1, inserts: 1 });
    expect(sqlite.prepare("SELECT count(*) AS total FROM major_projects").get()?.total).toBe(0);
    expect((await importProjects(upload(projectPath, projects))).status).toBe(200);
    expect(sqlite.prepare("SELECT name FROM major_projects").get()?.name).toBe("Town Water Upgrades");
    expect(sqlite.prepare("SELECT action FROM audit_logs ORDER BY rowid").all().map(r => r.action))
      .toEqual(["award_history.upload", "canadabuys.upload", "major_project.source_upload"]);
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    sqlite.close();
  }
});
