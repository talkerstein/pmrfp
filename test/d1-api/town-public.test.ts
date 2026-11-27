import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import { getNativeTownListing } from "@/lib/town-jobs/public-data";

it("serves only public municipal fields, redacted Q&A, and a public award", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(`INSERT INTO _customer_app_authority VALUES(1,'native-v1');
      INSERT INTO rfp_posts(id,title,slug,status,source_type,deadline,buyer_key,buyer_name,contact_visibility,
        contact_email,budget_public,budget_min,sealed,keep_alive_token,post_kind)
      VALUES('job','Town request','town-request','published','public_buyer_direct','2026-12-25',
        'on/hamilton','Hamilton','pmrfp_mediated','owner@example.test',0,'1500',1,'town-token','quote_request');
      INSERT INTO town_job_questions(id,rfp_id,question,public_question,answer,status,answered_at)
        VALUES('q1','job','Unedited question','Redacted question','Published answer','answered','2026-11-27T00:00:00Z');
      INSERT INTO town_job_questions(id,rfp_id,question,status) VALUES('q2','job','Draft question','open');
      INSERT INTO town_job_results(rfp_id,award_winner_name,award_amount,award_amount_public,award_date,award_published_at)
        VALUES('job','Winning company','0000001500.00',0,'2026-11-28','2026-11-28T00:00:00Z');`);
    const prepare = (sql: string, values: (string | number | null)[] = []): D1Statement => ({
      bind: (...args) => prepare(sql, args),
      first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
      all: async <T>() => ({ success: true, results: sqlite.prepare(sql).all(...values) as T[], meta: {} }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    });
    const db: D1Binding = {
      prepare,
      batch: <T>(statements: D1Statement[]) => Promise.all(statements.map((statement) => statement.all<T>())),
    };
    const found = await getNativeTownListing("town-request", db);
    expect(found?.post).toMatchObject({ title: "Town request", contact_email: null, budget_min: null });
    expect(found?.qa).toEqual([{ id: "q1", question: "Redacted question", answer: "Published answer", answeredAt: "2026-11-27T00:00:00Z" }]);
    expect(found?.sealed).toMatchObject({ openedAt: null });
    expect(found?.award).toMatchObject({ winner: "Winning company", amount: null });
    sqlite.exec("UPDATE rfp_posts SET status='draft' WHERE id='job'");
    expect(await getNativeTownListing("town-request", db)).toBeNull();
  } finally {
    sqlite.close();
  }
});
