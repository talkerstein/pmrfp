import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { inviteUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { GET, POST } from "@/app/api/email/invite-unsubscribe/route";

it("accepts signed invitation opt-outs against D1 and preserves an existing suppression", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO organizations(id,name,slug) VALUES('town','Town','town');
      INSERT INTO rfp_posts(id,title,slug,keep_alive_token) VALUES('rfp','Test town tender','town-test','token');
      INSERT INTO town_invites(id,rfp_id,organization_id,kind,email_key)
        VALUES('2d9fa8ee-113e-4bde-8008-c147044d9881','rfp','town','email','vendor@example.test');`);
    vi.stubEnv("PMRFP_VPS_LIVE_AUTH", "enabled");
    vi.stubEnv("PMRFP_VPS_D1_TRANSPORT_KEY", "a".repeat(64));
    vi.stubEnv("UNSUBSCRIBE_SECRET", "test-unsubscribe-local-only");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, request: RequestInit) => {
      const query = JSON.parse(String(request.body)) as { sql: string; params: string[] };
      const results = sqlite.prepare(query.sql).all(...query.params);
      return Response.json({ success: true, result: [{ success: true, results, meta: {} }] });
    }));
    const url = inviteUnsubscribeUrl("https://pmrfp.com", "2d9fa8ee-113e-4bde-8008-c147044d9881")!;
    expect((await GET(new Request(url + "x"))).status).toBe(400);
    expect(sqlite.prepare("SELECT * FROM email_suppressions").all()).toEqual([]);
    const result = await POST(new Request(url, { method: "POST" }));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(sqlite.prepare("SELECT email_key,reason FROM email_suppressions").get())
      .toMatchObject({ email_key: "vendor@example.test", reason: "unsubscribe" });
    sqlite.exec("UPDATE email_suppressions SET reason='complaint',detail='Mailbox complaint'");
    expect((await GET(new Request(url))).status).toBe(200);
    expect(sqlite.prepare("SELECT reason,detail FROM email_suppressions").get())
      .toMatchObject({ reason: "complaint", detail: "Mailbox complaint" });
    sqlite.exec("DELETE FROM _customer_app_authority");
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(400);
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    sqlite.close();
  }
});
