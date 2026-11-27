import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { SessionContext } from "@/lib/access/access";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { awardVpsBidComparison, importVpsBidResponses, readVpsBidShare, setVpsBidShare } from "@/lib/d1/vps-bid-comparisons";
import { buildSheet } from "@/lib/bid-compare/view";
import { insertD1Tools, renewD1Contract } from "@/lib/d1/pm-tools";

it("imports and renews property-manager records only for current company members", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const user = "00000000-0000-4000-8000-000000000091";
    const org = "00000000-0000-4000-8000-000000000092";
    const outside = "00000000-0000-4000-8000-000000000093";
    for (const id of [user, outside]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,'property_manager')").run(id, id + "@example.test");
    }
    sqlite.prepare("INSERT INTO organizations(id,name,slug) VALUES(?,'Property group','local-pm')").run(org);
    sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('member',?,?,'owner')").run(org,user);
    const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
      all: async <T>() => (/^SELECT/i.test(sql.trim())
        ? { success:true, results:sqlite.prepare(sql).all(...params) as T[], meta:{} }
        : { success:true, results:[], meta:{ changes:Number(sqlite.prepare(sql).run(...params).changes) } }),
      run: async () => ({ success:true, results:[], meta:{ changes:Number(sqlite.prepare(sql).run(...params).changes) } }),
    });
    const db: D1Binding = {
      prepare,
      async batch<T>(statements: D1Statement[]) {
        sqlite.exec("BEGIN");
        try {
          const rows = [];
          for (const stmt of statements) rows.push(await stmt.all<T>());
          sqlite.exec("COMMIT");
          return rows;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    const session = {userId:user,organization:{id:org}} as SessionContext;
    const stranger = {...session,userId:outside};
    const contract = {service_detail:"Roof maintenance",building_name:"Test property",vendor_email:null,
      start_date:"2026-01-01",end_date:"2026-12-31",auto_renews:false,currency:"CAD"};
    await expect(insertD1Tools("service_contracts",stranger,[contract],db)).resolves.toBe(0);
    await expect(insertD1Tools("service_contracts",session,[contract],db)).resolves.toBe(1);
    const id = String(sqlite.prepare("SELECT id FROM service_contracts").get()?.id);
    const now = new Date("2026-11-27T00:00:00Z");
    await expect(renewD1Contract(stranger,id,now,db)).resolves.toBe("notFound");
    await expect(renewD1Contract(session,id,now,db)).resolves.toBe("renewed");
    expect(sqlite.prepare("SELECT start_date,end_date FROM service_contracts").get())
      .toMatchObject({start_date:"2027-01-01",end_date:"2027-12-31"});
    const starter = {service_detail:"Winter maintenance",starter_key:"snow",currency:"CAD"};
    await expect(insertD1Tools("service_contracts",session,[starter],db)).resolves.toBe(1);
    await expect(insertD1Tools("service_contracts",session,[starter],db)).resolves.toBe(0);
    const cert = {vendor_name:"Local vendor",cert_type:"other",contact_email:null};
    await expect(insertD1Tools("vendor_certificates",session,[cert],db)).resolves.toBe(1);
    expect(sqlite.prepare("SELECT organization_id,vendor_name FROM vendor_certificates").get()).toMatchObject({organization_id:org,vendor_name:"Local vendor"});
    const sheet = "00000000-0000-4000-8000-000000000094";
    const bid = "00000000-0000-4000-8000-000000000095";
    sqlite.prepare("INSERT INTO bid_comparisons(id,organization_id,title) VALUES(?,?,'Roof bids')").run(sheet,org);
    sqlite.prepare(`INSERT INTO bid_comparison_bids(id,comparison_id,organization_id,company_name,contact_email,file_path)
      VALUES(?,?,?,'Roof vendor','vendor@example.test','private.pdf')`).run(bid,sheet,org);
    expect((await setVpsBidShare(stranger,sheet,true,db)).ok).toBe(false);
    const share = await setVpsBidShare(session,sheet,true,db);
    if (!share.ok || !share.token) throw Error("Expected a share link");
    const current = await readVpsBidShare(share.token,db);
    if (current.state !== "open") throw Error("Expected shared sheet");
    const view = buildSheet({scopeItems:current.comparison.scope_items,bids:current.bids,certs:current.certs,orgs:current.orgs,shared:true});
    expect(view.bids[0]).toMatchObject({contactEmail:null,fileName:null,hasFile:false});
    await setVpsBidShare(session,sheet,true,db);
    expect(await readVpsBidShare(share.token,db)).toEqual({state:"invalid"});
    expect(await awardVpsBidComparison(stranger,sheet,bid,false,"en",db)).toEqual({ok:false,error:"notFound"});
    expect(await awardVpsBidComparison(session,sheet,bid,false,"en",db)).toMatchObject({ok:true,rfpRecorded:false,notified:false});
    expect(await awardVpsBidComparison(session,sheet,bid,false,"en",db)).toEqual({ok:false,error:"awarded"});
    const rfp = "00000000-0000-4000-8000-000000000096";
    const linkedSheet = "00000000-0000-4000-8000-000000000097";
    const interest = "00000000-0000-4000-8000-000000000098";
    sqlite.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,posted_by_user_id,keep_alive_token)
      VALUES(?,'Roof tender','roof-tender','published','property_manager_direct',?,'roof-token')`).run(rfp,user);
    sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('trade-org','Trade company','trade-company')");
    sqlite.prepare("INSERT INTO rfp_interests(id,rfp_id,trade_organization_id) VALUES(?,?,'trade-org')").run(interest,rfp);
    sqlite.prepare("INSERT INTO bid_comparisons(id,organization_id,title,rfp_id) VALUES(?,?,'Linked bids',?)").run(linkedSheet,org,rfp);
    expect(await importVpsBidResponses(stranger,linkedSheet,db)).toEqual({ok:false,error:"notFound"});
    expect(await importVpsBidResponses(session,linkedSheet,db)).toEqual({ok:true,added:1,full:false});
    expect(await importVpsBidResponses(session,linkedSheet,db)).toEqual({ok:true,added:0,full:false});
    const imported = String(sqlite.prepare("SELECT id FROM bid_comparison_bids WHERE comparison_id=?").get(linkedSheet)?.id);
    expect(await awardVpsBidComparison(session,linkedSheet,imported,false,"en",db)).toMatchObject({ok:true,rfpRecorded:true});
    expect(sqlite.prepare("SELECT status FROM rfp_posts WHERE id=?").get(rfp)).toMatchObject({status:"awarded"});

  } finally {
    sqlite.close();
  }
});
