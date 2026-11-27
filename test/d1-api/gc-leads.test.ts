import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { postVpsRfp } from "@/lib/d1/vps-rfp-post";
import { readNativeAward, readNativePackages } from "@/lib/gc/data";
import { nativeLeadSettings } from "@/lib/leads/load";
import { readNativeProjectProFields } from "@/lib/major-projects/data";

it("links a GC package to a public award and keeps lead settings and contact fields scoped", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const prepare = (sql:string,args:(string|number|null)[] = []): D1Statement => ({
      bind:(...values) => prepare(sql,values),
      first:async <T>() => (sqlite.prepare(sql).get(...args) ?? null) as T|null,
      all:async <T>() => {
        const results = sqlite.prepare(sql).all(...args) as T[];
        return {success:true,results,meta:{changes:/^SELECT/.test(sql.trim()) ? 0 : Number(sqlite.prepare("SELECT changes() AS n").get()?.n)}};
      },
      run:async () => ({success:true,results:[],meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}),
    });
    const db: D1Binding = {
      prepare,
      async batch<T>(statements:D1Statement[]) {
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
    const manager = "00000000-0000-4000-8000-000000000091";
    const bidder = "00000000-0000-4000-8000-000000000092";
    const org = "00000000-0000-4000-8000-000000000093";
    for (const [actor,role] of [[manager,"property_manager"],[bidder,"trade"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(actor);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)").run(actor,actor+"@example.test",role);
    }
    sqlite.exec(`INSERT INTO regions(id,name,slug) VALUES('tor','Toronto','toronto');
      INSERT INTO trade_categories(id,name,slug) VALUES('roof','Roofing','roofing');
      INSERT INTO rfp_posts(id,title,slug,status,source_type,keep_alive_token,summary) VALUES
       ('old-award','Public work award','roof-work-cba-ws123','published','public_source','award-token',
        'Awarded public work to Acme Paving — $12,000 CAD.'),
       ('hidden-award','Hidden work award','private-work-cba-ws123','draft','public_source','hidden-token',NULL);
      INSERT INTO major_projects(id,slug,source,source_key,name,license,general_contractor,bid_list_url,bid_route)
      VALUES('mp','civic-roof','feed','source-123','Civic roof','Open data','General contractor','https://example.test/bids','Email the estimator');`);
    const award = await readNativeAward("roof-work-cba-ws123","slug",db);
    expect(award).toMatchObject({id:"old-award",winner:"Acme Paving",value:"$12,000 CAD"});
    expect(await readNativeAward("hidden-award","id",db)).toBeNull();
    const input = {
      title:"Roofing package — Civic hall",summary:"A package for the building roof.",scope:"Full scope",regionSlug:"toronto",
      categories:["roofing"],deadline:new Date(Date.now()+86_400_000),contactVisibility:"pmrfp_mediated" as const,acceptTerms:true as const,
    };
    await expect(postVpsRfp(manager,null,"blocked","en",input,db,{gcProjectName:"Civic hall",awardedRfpId:"hidden-award"})).rejects.toThrow();
    const posted = await postVpsRfp(manager,null,"civic-package","en",input,db,{gcProjectName:"Civic hall",awardedRfpId:"old-award"});
    expect(sqlite.prepare("SELECT awarded_rfp_id,gc_project_name,status,source_type FROM rfp_posts WHERE id=?").get(posted))
      .toMatchObject({awarded_rfp_id:"old-award",gc_project_name:"Civic hall",status:"pending_review",source_type:"gc_package"});
    expect(await readNativePackages(["roof-work-cba-ws123"],20,db)).toEqual([]);
    sqlite.prepare("UPDATE rfp_posts SET status='published' WHERE id=?").run(posted);
    expect(await readNativePackages(["roof-work-cba-ws123"],20,db))
      .toMatchObject([{slug:"civic-package",awardSlug:"roof-work-cba-ws123"}]);

    sqlite.prepare("INSERT INTO organizations(id,name,slug,organization_type) VALUES(?,'Roofers','roofers','trade_company')").run(org);
    sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES('m',?,?,'owner')").run(org,bidder);
    sqlite.prepare("INSERT INTO organization_categories(id,organization_id,category_id) VALUES('c',?,'roof')").run(org);
    sqlite.prepare("INSERT INTO organization_regions(id,organization_id,region_id) VALUES('r',?,'tor')").run(org);
    expect(await nativeLeadSettings(manager,org,db)).toEqual({tradeSlugs:[],regionIds:[]});
    expect(await nativeLeadSettings(bidder,org,db)).toEqual({tradeSlugs:["roofing"],regionIds:["tor"]});
    expect(await readNativeProjectProFields(bidder,["mp"],db)).toEqual(new Map());
    sqlite.prepare("INSERT INTO subscriptions(id,organization_id,status,tier) VALUES('s',?,'active','pro')").run(org);
    expect((await readNativeProjectProFields(bidder,["mp"],db)).get("mp"))
      .toMatchObject({generalContractor:"General contractor",bidListUrl:"https://example.test/bids"});
    expect(await readNativeProjectProFields(manager,["mp"],db)).toEqual(new Map());
    sqlite.exec("UPDATE major_projects SET review_status='rejected' WHERE id='mp'");
    expect(await readNativeProjectProFields(bidder,["mp"],db)).toEqual(new Map());
  } finally {
    sqlite.close();
  }
});
