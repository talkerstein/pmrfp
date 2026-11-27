import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import {
  getNativeOwnWinnerClaim, getNativeWinnerClaim, listNativeWinnerClaims, reviewNativeWinnerClaim, submitNativeWinnerClaim,
} from "@/lib/claims/native";

it("keeps claim evidence private, enforces unique approval and audits each review", async () => {
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
    const other = "00000000-0000-4000-8000-000000000092";
    const admin = "00000000-0000-4000-8000-000000000093";
    const company = "00000000-0000-4000-8000-000000000094";
    const competing = "00000000-0000-4000-8000-000000000095";
    for (const [id,email] of [[owner,"owner@acmepaving.test"],[other,"other@example.test"],[admin,"staff@example.test"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)").run(id,email,id===admin ? "admin" : "trade");
    }
    for (const [org,actor,name,slug] of [[company,owner,"Acme Paving Ltd","acme-paving"],[competing,other,"Other Paving Ltd","other-paving"]]) {
      sqlite.prepare(`INSERT INTO organizations(id,name,slug,email,organization_type,status,profile_status,public_contact_visibility)
        VALUES(?,?,?,'private@example.test','trade_company','active','approved','hide_contact')`).run(org,name,slug);
      sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')").run("m-"+actor,org,actor);
    }
    const manual = {actor:other,org:competing,slug:"acme-paving",name:"Acme Paving Ltd",website:"unrelated.test",note:"Proof sent privately"};
    const pending = await submitNativeWinnerClaim(manual,db);
    if (pending.result!=="saved") throw Error("Could not save review claim");
    expect(pending.status).toBe("pending");
    expect(await submitNativeWinnerClaim({...manual,note:"Updated proof"},db)).toMatchObject({result:"saved",claimId:pending.claimId});
    expect(await getNativeWinnerClaim(manual.slug,db)).toBeNull();
    expect(await getNativeOwnWinnerClaim(manual.slug,owner,db)).toBeNull();
    expect(await listNativeWinnerClaims(other,db)).toEqual([]);
    expect(await reviewNativeWinnerClaim(other,pending.claimId,"approved",null,db)).toEqual({result:"missing"});
    const direct = await submitNativeWinnerClaim({...manual,actor:owner,org:company,website:"acmepaving.test"},db);
    if (direct.result!=="saved") throw Error("Could not save verified claim");
    expect(direct.status).toBe("approved");
    expect(await submitNativeWinnerClaim(manual,db)).toEqual({result:"taken"});
    expect(await reviewNativeWinnerClaim(admin,pending.claimId,"approved",null,db)).toEqual({result:"conflict"});
    expect(await getNativeWinnerClaim(manual.slug,db)).toMatchObject({org_slug:"acme-paving",email:null,website:"https://acmepaving.test"});
    expect(await reviewNativeWinnerClaim(admin,direct.claimId,"revoked","Company mismatch",db)).toEqual({result:"saved",slug:manual.slug});
    expect(await reviewNativeWinnerClaim(admin,pending.claimId,"approved","Verified externally",db)).toEqual({result:"saved",slug:manual.slug});
    expect(await getNativeWinnerClaim(manual.slug,db)).toMatchObject({org_slug:"other-paving",email:null});
    expect(sqlite.prepare("SELECT count(*) AS n FROM audit_logs").get()?.n).toBe(5);
  } finally {
    sqlite.close();
  }
});
