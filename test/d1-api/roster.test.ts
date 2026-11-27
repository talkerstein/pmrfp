import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import {
  addNativeCustomEntry, claimNativeRosterInvite, createNativeRosterShare, deleteNativeEntry,
  deleteNativeRoster, findNativeStandardEntry, listNativeInvitedEmails, listNativeRosters, loadNativeRoster,
  readNativeSharedRoster, revokeNativeRosterShare, saveNativeEntry, saveNativeRoster, unsubscribeNativeRosterInvite,
} from "@/lib/roster/native";
import { buildVcards, cleanRosterInput, rosterContacts, rosterRows } from "@/lib/roster/rules";

it("scopes native roster edits and links, and protects repeat invitations and opted-out addresses", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
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
    for (const [userId, orgId] of [["user-a", "org-a"], ["user-b", "org-b"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(userId);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role,status) VALUES(?,?,'property_manager','active')").run(userId, userId + "@example.test");
      sqlite.prepare("INSERT INTO organizations(id,name,slug,status) VALUES(?,?,?,'active')").run(orgId, orgId, orgId);
      sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')").run("member-" + userId, orgId, userId);
    }
    const scope = { userId: "user-a", orgId: "org-a" };
    const other = { userId: "user-b", orgId: "org-b" };
    const forged = { ...scope, userId: other.userId };
    const input = cleanRosterInput({ building_name: "Hamilton Building", province: "Ontario" }, "CA");
    if (!input.ok) throw Error("Invalid test building");
    expect(await saveNativeRoster(forged, input.value, undefined, db)).toBeNull();
    const building = await saveNativeRoster(scope, input.value, undefined, db);
    if (!building) throw Error("Roster was not created");
    expect(await saveNativeRoster(other, input.value, building.id, db)).toBeNull();
    expect((await loadNativeRoster(other, building.id, db)).roster).toBeNull();
    expect((await listNativeRosters(scope, db)).rosters).toHaveLength(1);
    const entry = await saveNativeEntry(scope, building.id, "plumbing", null,
      { primary_name: "Vendor in roster", primary_phone: "+1 905 555 0100", primary_email: "vendor@example.test", available_24_7: true }, db);
    if (!entry) throw Error("Vendor entry was not created");
    const upserted = await saveNativeEntry(scope, building.id, "plumbing", null, { not_needed: true }, db);
    expect(upserted).toEqual(entry);
    expect(await findNativeStandardEntry(scope, building.id, "plumbing", db)).toMatchObject({ not_needed: true, available_24_7: true });
    expect(await saveNativeEntry(forged, building.id, "plumbing", entry.id, { notes: "outside" }, db)).toBeNull();
    await saveNativeEntry(scope, building.id, "plumbing", entry.id, { not_needed: false }, db);
    expect(await addNativeCustomEntry(other, building.id, "Generator", null, db)).toBeNull();
    expect(await addNativeCustomEntry(scope, building.id, "Generator", null, db)).toHaveProperty("id");

    expect(await createNativeRosterShare(other, building.id, null, db)).toEqual({ error: "unavailable" });
    const share = await createNativeRosterShare(scope, building.id, "Emergency desk", db);
    if (!("token" in share)) throw Error("Share was not created");
    const now = new Date("2026-11-27T00:00:00Z");
    const shared = await readNativeSharedRoster(share.token, now, db);
    if (!shared) throw Error("Share was not readable");
    const contacts = rosterContacts(shared.roster, rosterRows(shared.entries, { country: "CA", province: shared.roster.province }),
      { category: (row) => row.category, primary: "Primary", backup: "Backup", onCall: "On call", available247: "24/7" });
    expect(buildVcards(contacts)).toContain("Vendor in roster");
    const [link] = (await loadNativeRoster(scope, building.id, db)).links;
    expect(link).toMatchObject({ view_count: 1, last_viewed_at: now.toISOString() });
    expect(await revokeNativeRosterShare(other, link.id, db)).toBeNull();
    expect(await revokeNativeRosterShare(scope, link.id, db)).toEqual({ roster_id: building.id });
    expect(await readNativeSharedRoster(share.token, undefined, db)).toBeNull();

    expect(await claimNativeRosterInvite(other, entry.id, "primary", "en", now, db)).toEqual({ error: "unavailable" });
    const invite = await claimNativeRosterInvite(scope, entry.id, "primary", "en", now, db);
    if (!("id" in invite)) throw Error("Invite was not claimed");
    expect(await claimNativeRosterInvite(scope, entry.id, "primary", "en", now, db)).toEqual({ error: "already" });
    expect(await listNativeInvitedEmails(scope, db)).toEqual(new Set(["vendor@example.test"]));
    expect(await unsubscribeNativeRosterInvite(invite.id, db)).toBe(true);
    expect(await claimNativeRosterInvite(scope, entry.id, "primary", "en", now, db)).toEqual({ error: "unsubscribed" });
    expect(await deleteNativeEntry(other, entry.id, db)).toBeNull();
    expect(await deleteNativeEntry(scope, entry.id, db)).toEqual({ roster_id: building.id });
    expect(await deleteNativeRoster(other, building.id, db)).toBeNull();
    expect(await deleteNativeRoster(scope, building.id, db)).toEqual({ id: building.id });
    expect((await loadNativeRoster(scope, building.id, db)).links).toEqual([]);
  } finally {
    sqlite.close();
  }
});
