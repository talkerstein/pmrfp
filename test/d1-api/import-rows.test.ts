import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { upsertD1Import } from "../../src/lib/d1/import-rows";

it("keeps stable IDs and existing moderation columns and allocates SQLite integer IDs", async () => {
  const db = new DatabaseSync(":memory:");
  const statement = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
    bind: (...values) => statement(sql, values),
    async first<T>() { return (db.prepare(sql).get(...params) ?? null) as T | null; },
    async all<T>() { return { success:true, results:db.prepare(sql).all(...params) as T[], meta:{} }; },
    async run() { return { success:true, results:[], meta:{changes:Number(db.prepare(sql).run(...params).changes)} }; },
  });
  const binding: D1Binding = { prepare:statement, async batch<T>(statements: D1Statement[]) {
    return Promise.all(statements.map(query => query.all<T>()));
  } };
  try {
    db.exec(`CREATE TABLE award_history(id TEXT PRIMARY KEY,source TEXT,source_key TEXT,
        title TEXT,trade_slugs TEXT, reviewed INTEGER DEFAULT 0, UNIQUE(source,source_key));
      CREATE TABLE permit_leads(id INTEGER NOT NULL,source TEXT,source_key TEXT,value_cad TEXT,
        PRIMARY KEY(id), UNIQUE(source,source_key));`);
    const first = await upsertD1Import<{id:string}>(binding,"award_history",[
      {source:"test",source_key:"a",title:"Original",trade_slugs:["roofing"]},
    ],{returnAwards:true});
    db.exec("UPDATE award_history SET reviewed=1");
    const next = await upsertD1Import<{id:string}>(binding,"award_history",[
      {source:"test",source_key:"a",title:"Corrected",trade_slugs:["roofing","windows"]},
    ],{returnAwards:true});
    expect(next[0].id).toEqual(first[0].id);
    expect(db.prepare("SELECT reviewed,title,trade_slugs FROM award_history").get()).toMatchObject({
      reviewed:1,title:"Corrected",trade_slugs:'["roofing","windows"]',
    });
    await upsertD1Import(binding,"permit_leads",[{source:"test",source_key:"permit",value_cad:100_000}]);
    await upsertD1Import(binding,"permit_leads",[{source:"test",source_key:"permit",value_cad:245_000}]);
    expect(db.prepare("SELECT id,CAST(value_cad AS INTEGER) AS value_cad FROM permit_leads").all()).toEqual([{id:1,value_cad:245000}]);
  } finally {
    db.close();
  }
});
