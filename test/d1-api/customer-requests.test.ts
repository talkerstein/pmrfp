import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { recordContactRequest, recordCorrectionRequest, resolveCorrectionRequest } from "@/lib/d1/customer-requests";
import { toCorrectionRow } from "@/lib/corrections/rules";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";

it("stores customer requests and permits only an active admin to resolve and audit a correction", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    const admin = "00000000-0000-4000-8000-000000000091";
    const member = "00000000-0000-4000-8000-000000000092";
    for (const [id, role] of [[admin, "admin"], [member, "trade"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?)").run(id, id + "@example.test", role);
    }
    const prepare = (sql: string, params: (string | number | null)[] = []): D1Statement => ({
      bind: (...values) => prepare(sql, values),
      first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
      all: async () => ({
        success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) },
      }),
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
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
    const contact = { requestType: "general_contact" as const, name: "Example", email: "example@example.test", message: "Example contact" };
    await expect(recordContactRequest(contact, db)).rejects.toThrow();
    sqlite.exec("INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    await recordContactRequest(contact, db);
    expect(sqlite.prepare("SELECT message FROM contact_requests").get()).toMatchObject({ message: contact.message });
    await recordCorrectionRequest(toCorrectionRow({
      pageKind: "other", pagePath: "/", reason: "wrong_info", details: "Example correction request",
      contactEmail: contact.email, lang: "en",
    }, member), db);
    const id = String(sqlite.prepare("SELECT id FROM correction_requests").get()?.id);
    const update = { id, status: "corrected", resolution: "Updated the record", final: true, now: "2026-11-27T07:15:00Z" };
    await expect(resolveCorrectionRequest({ ...update, actor: member }, db)).resolves.toBe(false);
    expect(sqlite.prepare("SELECT status FROM correction_requests").get()).toMatchObject({ status: "new" });
    await expect(resolveCorrectionRequest({ ...update, actor: admin }, db)).resolves.toBe(true);
    expect(sqlite.prepare("SELECT resolved_by,status FROM correction_requests").get()).toMatchObject({ resolved_by: admin, status: "corrected" });
    expect(sqlite.prepare("SELECT actor_user_id,entity_id FROM audit_logs").get()).toMatchObject({ actor_user_id: admin, entity_id: id });
  } finally {
    sqlite.close();
  }
});
