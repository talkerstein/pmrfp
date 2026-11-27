import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { SessionContext } from "../../src/lib/access/access";
import type { D1Binding, D1Statement } from "../../src/lib/d1/contracts";
import { attachMemberFile, attachVendorFile, serveMemberFile } from "../../src/lib/d1/private-attachments";
import { attachmentTables } from "../../src/lib/d1/private-attachment-policy";
import storageGateway from "../../workers/storage-preview/private-project-files";

it("stores each document type privately, rechecks membership, retires replacements and redeems vendor tokens once", async () => {
  const db = new DatabaseSync(":memory:");
  const org = "40000000-0000-4000-8000-000000000001";
  const owner = "40000000-0000-4000-8000-000000000002";
  const other = "40000000-0000-4000-8000-000000000003";
  const id = "40000000-0000-4000-8000-000000000004";
  const auth = (userId: string) => ({userId} as SessionContext);
  const key = "a".repeat(64);
  const tokenHash = "b".repeat(64);
  type Param = string | number | null;
  const statement = (sql: string, values: Param[] = []): D1Statement => ({
    bind: (...params) => statement(sql, params),
    first: async <T>() => (db.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ success: true, results: db.prepare(sql).all(...values) as T[], meta: {} }),
    run: async () => ({ success: true, results: [], meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  });
  const binding = { prepare: statement } as D1Binding;
  const saved = new Map<string, {data: ArrayBuffer; mime: string; sha256: string}>();
  const head = async (k: string) => {
    const o = saved.get(k);
    return o ? { size: o.data.byteLength, httpMetadata: { contentType: o.mime }, customMetadata: { sha256: o.sha256 } } : null;
  };
  const bucket = {
    head,
    async get(k: string) {
      const info = await head(k);
      const o = saved.get(k);
      return info && o ? { ...info, body: new Response(o.data).body! } : null;
    },
    async put(k: string, data: ArrayBuffer, opts: {httpMetadata: {contentType: string}; customMetadata: {sha256: string}}) {
      saved.set(k, { data, mime: opts.httpMetadata.contentType, sha256: opts.customMetadata.sha256 });
    },
    async delete(k: string) { saved.delete(k); },
  };
  const env = { APP_DB: binding, PRIVATE_FILES: bucket, GATEWAY_SECRET: key, VPS_IP: "192.0.2.4", MODE: "serving" as const };
  const gateway: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    req.headers.set("cf-connecting-ip", env.VPS_IP);
    return storageGateway.fetch(req, env);
  };
  vi.stubEnv("PMRFP_PRIVATE_R2_GATEWAY_KEY", key);
  try {
    db.exec(readFileSync("deploy/vps/private-attachments.sql", "utf8"));
    db.exec(`
      CREATE TABLE _customer_app_authority(id,mode);
      INSERT INTO _customer_app_authority VALUES (1,'native-v1');
      CREATE TABLE users_profile(id,status,primary_role);
      CREATE TABLE organizations(id,status);
      CREATE TABLE organization_members(organization_id,user_id);
      INSERT INTO organizations VALUES ('${org}','active');
      INSERT INTO users_profile VALUES ('${owner}','active','property_manager'),('${other}','active','property_manager');
      INSERT INTO organization_members VALUES ('${org}','${owner}');
    `);
    const file = { ok: true as const, data: Buffer.from("%PDF-1.4\nfile"), mime: "application/pdf", name: "example.pdf" };
    for (const kind of ["contract","certificate","quote"] as const) {
      const table = attachmentTables[kind];
      db.exec(`CREATE TABLE ${table}(id,organization_id,file_path,file_name,file_uploaded_at,updated_at,
        uploaded_by,request_token_hash,request_expires_at,insurer,policy_number,coverage_amount,expires_on,
        reminder_stage,reminder_for,vendor_reminded_stage)`);
      db.prepare(`INSERT INTO ${table}(id,organization_id,request_token_hash,request_expires_at) VALUES (?,?,?,?)`)
        .run(id,org,tokenHash,new Date(Date.now() + 60_000).toISOString());
      await expect(attachMemberFile(kind,id,auth(other),file,binding,gateway)).rejects.toMatchObject({status:404});
      await attachMemberFile(kind,id,auth(owner),file,binding,gateway);
      const previous = db.prepare(`SELECT file_path FROM ${table}`).get()?.file_path as string;
      const anonymous = await storageGateway.fetch(new Request("https://example.invalid/v1/"+previous),env);
      expect(anonymous.status).toBe(404);
      await expect(serveMemberFile(kind,id,auth(other),false,binding,gateway)).rejects.toMatchObject({status:404});
      const allowed = await serveMemberFile(kind,id,auth(owner),false,binding,gateway);
      expect(allowed.headers.get("cache-control")).toBe("private, no-store");
      expect(allowed.headers.get("content-disposition")).toBe('attachment; filename="example.pdf"');
      expect(await allowed.text()).toBe(file.data.toString());
      if (kind === "certificate") {
        const values = { insurer:"Example",policy_number:null,coverage_amount:null,expires_on:"2027-02-02" };
        await attachVendorFile(id,tokenHash,file,values,binding,gateway);
        await expect(attachVendorFile(id,tokenHash,file,values,binding,gateway)).rejects.toMatchObject({status:404});
        expect(db.prepare(`SELECT request_token_hash,uploaded_by FROM ${table}`).get())
          .toMatchObject({request_token_hash:null,uploaded_by:"vendor"});
      } else {
        await attachMemberFile(kind,id,auth(owner),file,binding,gateway);
      }
      expect(saved.has(previous)).toBe(false);
    }
    db.exec("DELETE FROM organization_members");
    await expect(serveMemberFile("contract",id,auth(owner),false,binding,gateway)).rejects.toMatchObject({status:404});
  } finally {
    vi.unstubAllEnvs();
    db.close();
  }
});
