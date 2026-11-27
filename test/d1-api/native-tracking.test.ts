import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import type { Batch } from "@/lib/tracking/buffer";
import { flushNativeTracking } from "@/lib/tracking/native";
import { fetchD1SiteReport } from "@/lib/tracking/d1-report";

it("batches native views and events without counting bots' rejected payloads, staff, or the posting company", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const prepare = (sql: string, args: (string | number | null)[] = []): D1Statement => ({
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...args) ?? null) as T | null,
      all: async <T>() => ({ success: true, results: sqlite.prepare(sql).all(...args) as T[], meta: {} }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
    });
    const db: D1Binding = {
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
    const owner = "00000000-0000-4000-8000-000000000091";
    const colleague = "00000000-0000-4000-8000-000000000092";
    const staff = "00000000-0000-4000-8000-000000000093";
    for (const actor of [owner,colleague,staff]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(actor);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)")
        .run(actor,actor+"@example.test",actor===staff ? "admin" : "property_manager");
    }
    sqlite.exec("INSERT INTO organizations(id,name,slug,country) VALUES('host','Buyer','buyer','Canada')");
    for (const actor of [owner,colleague]) sqlite.prepare(`INSERT INTO organization_members(id,organization_id,user_id,role)
      VALUES(?,'host',?,'owner')`).run("member-"+actor,actor);
    sqlite.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,keep_alive_token,posted_by_organization_id,posted_by_user_id)
      VALUES('listing','Listing','listing','published','property_manager_direct','token','host',?)`).run(owner);
    const day = "2026-11-27";
    const t = new Date(day+"T15:00:00Z");
    const visitor = { day,h:"a".repeat(32),country:"CA",lang:"en",signed_in:false };
    const view = { day,slug:"listing",h:visitor.h,user_id:null,country:"CA",lang:"en" };
    const step = { event:"signup_step",path:"/sign-up",lang:"en",country:"CA",role:null,user_id:null,anon_hash:visitor.h,
      utm_source:null,utm_medium:null,utm_campaign:null,at:t.toISOString(),props:{step:"profile",email:"private@example.test"} };
    const pack: Batch = {
      visitors:[visitor,{...visitor,signed_in:true},{...visitor,h:"b".repeat(32),country:"US"}],
      pages:[{day,path:"/rfps/listing",country:"CA",n:2},{day,path:"/pricing",country:"US",n:1}],
      referrers:[{day,host:"ref.example.test",country:"CA",n:2}],
      views:[view,{...view,user_id:owner,h:"c".repeat(32)},{...view,user_id:staff,h:"d".repeat(32)},
        {...view,user_id:colleague,h:"e".repeat(32)},{...view,h:"invalid"}],
      events:[step, {...step,event:"not_allowed"}],
    };
    await flushNativeTracking(pack,db,t);
    await flushNativeTracking({...pack,pages:[],referrers:[],events:[]},db,t);
    expect(sqlite.prepare("SELECT count(*) AS n FROM rfp_views").get()?.n).toBe(1);
    expect(sqlite.prepare("SELECT props FROM site_events").get()?.props).toBe('{"step":"profile"}');
    const report = await fetchD1SiteReport(day,day,db);
    expect(report.daily).toEqual([{day,market:"CA",visitors:1,page_views:2},{day,market:"US",visitors:1,page_views:1}]);
    expect(report.top_referrers).toEqual([{market:"CA",host:"ref.example.test",visits:2}]);
    expect(report.steps).toEqual([{market:"CA",event:"signup_step",step:"profile",field:"",actors:1,n:1}]);
  } finally {
    sqlite.close();
  }
});
