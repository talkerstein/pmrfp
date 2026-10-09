import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portfolio follow-ups: private project photos (bucket placement, who gets
 * a signed URL, moving on visibility change, backfill), the owner-only
 * "Add a project" tile, and translated server messages.
 */

const SB = "https://abc.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = SB;

const { serviceState } = vi.hoisted(() => ({
  serviceState: { configured: true, client: null as unknown },
}));
vi.mock("@/lib/supabase/config", () => ({
  isServiceConfigured: () => serviceState.configured,
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceState.client,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  checkRateLimitByIp: async () => null,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
const { sessionState } = vi.hoisted(() => ({ sessionState: { session: null as unknown } }));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => sessionState.session,
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
}));

import {
  canonicalizePhotos,
  isOptimizablePhoto,
  isOwnPhotoUrl,
  photoLocation,
  sanitizePhotos,
  storedPhotoUrl,
  targetBucket,
  type ProjectPhoto,
} from "@/lib/projects/photos";
import { canViewProjectPhotos, type PhotoProject, type PhotoViewer } from "@/lib/projects/photo-access";
import {
  applyPhotoMoves,
  backfillProjectPhotos,
  planPhotoMoves,
  photosForViewer,
  proxiedPhotos,
  resolvePhotoUrls,
  syncProjectPhotos,
  type PhotoStore,
} from "@/lib/projects/photo-storage";
import { isProfileMember } from "@/lib/projects/profile-viewer";
import { isProfileMemberAction } from "@/lib/projects/profile-actions";
import { SERVER_MESSAGE_TEMPLATES, translateServerMessage } from "@/lib/projects/server-messages";
import portfolioClient from "@/i18n/messages/portfolioClient";
import { GET as unlistedPhoto } from "@/app/api/projects/[id]/photo/[file]/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const CS = "33333333-3333-4333-8333-333333333333";
const OTHER_CS = "44444444-4444-4444-8444-444444444444";
const F1 = "aaaaaaaa-0000-4000-8000-000000000001";
const F2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P1 = `${ORG}/${F1}.jpg`;
const P2 = `${ORG}/${F2}.jpg`;

const pub = (p: string) => storedPhotoUrl(SB, "public", p);
const priv = (p: string) => storedPhotoUrl(SB, "private", p);
const signedOf = (p: string) => `${SB}/storage/v1/object/sign/project-photos-private/${p}?token=eyJ.sig`;
const photo = (url: string, path: string, kind: ProjectPhoto["kind"] = "after"): ProjectPhoto => ({ url, path, kind, width: 800, height: 600 });

/** Fake Storage: records what was signed and where each object lives. */
function fakeStore(initial: Record<string, "public" | "private"> = {}, failMoves: string[] = []) {
  const where = new Map(Object.entries(initial));
  const signed: string[][] = [];
  const store: PhotoStore = {
    async sign(paths) {
      signed.push(paths);
      return new Map(paths.map((p) => [p, signedOf(p)]));
    },
    async move(path, from, to) {
      if (failMoves.includes(path)) return false;
      const at = where.get(path);
      if (at === from || at === to) {
        where.set(path, to);
        return true;
      }
      return false;
    },
  };
  return { store, signed, where };
}

/** Minimal chainable fake of the bits of supabase-js these functions use. */
function fakeDb(rows: Record<string, unknown>[]) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const db = {
    from() {
      let id: string | null = null;
      const q = {
        select: () => q,
        order: () => q,
        eq: (col: string, v: string) => {
          if (col === "id") id = v;
          return q;
        },
        range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }),
        maybeSingle: async () => ({ data: rows.find((r) => r.id === id) ?? null, error: null }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, v: string) => {
            updates.push({ id: v, patch });
            const row = rows.find((r) => r.id === v);
            if (row) Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
      return q;
    },
  };
  return { db: db as never, updates, rows };
}

const project = (over: Partial<PhotoProject> = {}): PhotoProject => ({
  id: CS,
  organizationId: ORG,
  visibility: "private",
  status: "published",
  ...over,
});

beforeEach(() => {
  serviceState.configured = true;
  serviceState.client = null;
  sessionState.session = null;
});

// ── Where photos live ─────────────────────────────────────────────────

describe("photo locations", () => {
  it("reads public URLs, stored private references and signed URLs", () => {
    expect(photoLocation(pub(P1), SB)).toEqual({ bucket: "public", path: P1 });
    expect(photoLocation(priv(P1), SB)).toEqual({ bucket: "private", path: P1 });
    expect(photoLocation(signedOf(P1), SB)).toEqual({ bucket: "private", path: P1 });
  });

  it("rejects foreign hosts, other companies' folders, odd paths and unsigned sign URLs", () => {
    expect(photoLocation(pub(P1).replace("abc", "evil"), SB)).toBeNull();
    expect(photoLocation(pub(P1), SB, OTHER_ORG)).toBeNull();
    expect(photoLocation(`${SB}/storage/v1/object/public/project-photos/${ORG}/../x.jpg`, SB)).toBeNull();
    expect(photoLocation(`${SB}/storage/v1/object/sign/project-photos-private/${P1}`, SB)).toBeNull();
    expect(photoLocation(`${SB}/storage/v1/object/sign/project-photos-private/${P1}?download=1`, SB)).toBeNull();
    expect(photoLocation(`${SB}/storage/v1/object/public/project-photos-private/${P1}`, SB)).toBeNull();
  });

  it("only public projects keep public URLs", () => {
    expect(targetBucket("public")).toBe("public");
    expect(targetBucket(null)).toBe("public"); // pre-migration rows
    expect(targetBucket("unlisted")).toBe("private");
    expect(targetBucket("private")).toBe("private");
  });

  it("isOwnPhotoUrl stays public-only, so public pages drop private references", () => {
    expect(isOwnPhotoUrl(pub(P1), SB)).toBe(true);
    expect(isOwnPhotoUrl(priv(P1), SB)).toBe(false);
    const raw = [photo(pub(P1), P1), photo(priv(P2), P2)];
    expect(sanitizePhotos(raw, SB).map((p) => p.path)).toEqual([P1]);
    expect(sanitizePhotos(raw, SB, ORG, { includePrivate: true }).map((p) => p.path)).toEqual([P1, P2]);
  });

  it("next/image only optimizes public photos (no signed URL in its year-long cache)", () => {
    expect(isOptimizablePhoto(pub(P1))).toBe(true);
    expect(isOptimizablePhoto(signedOf(P1))).toBe(false);
    expect(isOptimizablePhoto(`/api/projects/${CS}/photo/${F1}`)).toBe(false);
  });
});

describe("canonicalizing photos a form sends back", () => {
  it("turns a signed URL into the stored private reference", () => {
    expect(canonicalizePhotos([photo(signedOf(P1), P1)], SB, ORG)).toEqual([photo(priv(P1), P1)]);
  });

  it("keeps the bucket the project already has for a path (a client can't flip it)", () => {
    const existing = [photo(priv(P1), P1)];
    expect(canonicalizePhotos([photo(pub(P1), P1)], SB, ORG, existing)?.[0].url).toBe(priv(P1));
  });

  it("refuses another company's photo or a URL/path mismatch", () => {
    expect(canonicalizePhotos([photo(signedOf(P1), P1)], SB, OTHER_ORG)).toBeNull();
    expect(canonicalizePhotos([photo(signedOf(P1), P2)], SB, ORG)).toBeNull();
    expect(canonicalizePhotos([photo("https://evil.example/x.jpg", P1)], SB, ORG)).toBeNull();
  });
});

// ── Who may see them ─────────────────────────────────────────────────

describe("canViewProjectPhotos", () => {
  const cases: [string, PhotoProject, PhotoViewer, boolean][] = [
    ["private: anonymous", project(), { kind: "anonymous" }, false],
    ["private: another company's member", project(), { kind: "member", organizationId: OTHER_ORG }, false],
    ["private: own member", project(), { kind: "member", organizationId: ORG }, true],
    ["private draft: own member", project({ status: "draft" }), { kind: "member", organizationId: ORG }, true],
    ["private: admin", project(), { kind: "admin" }, true],
    ["private: share link for it", project(), { kind: "share", caseStudyId: CS }, true],
    ["private: share link for another project", project(), { kind: "share", caseStudyId: OTHER_CS }, false],
    ["private unpublished: share link", project({ status: "pending_review" }), { kind: "share", caseStudyId: CS }, false],
    ["private: review invite for it", project(), { kind: "reviewer", caseStudyId: CS }, true],
    ["private: review invite for another", project(), { kind: "reviewer", caseStudyId: OTHER_CS }, false],
    ["unlisted: anonymous link holder", project({ visibility: "unlisted" }), { kind: "anonymous" }, true],
    ["unlisted draft: anonymous", project({ visibility: "unlisted", status: "draft" }), { kind: "anonymous" }, false],
    ["public: anonymous", project({ visibility: "public" }), { kind: "anonymous" }, true],
    ["public pending: anonymous", project({ visibility: "public", status: "pending_review" }), { kind: "anonymous" }, false],
    ["member with no org id", project(), { kind: "member", organizationId: "" }, false],
  ];
  it.each(cases)("%s", (_name, p, v, want) => {
    expect(canViewProjectPhotos(p, v)).toBe(want);
  });
});

describe("signed URLs go only to allowed viewers", () => {
  const photos = [photo(priv(P1), P1, "before"), photo(priv(P2), P2, "after")];

  it("signs a private project's photos for its own member", async () => {
    const { store, signed } = fakeStore();
    const out = await photosForViewer(project(), { kind: "member", organizationId: ORG }, photos, priv(P2), { store });
    expect(signed).toEqual([[P1, P2]]);
    expect(out.photos.map((p) => p.url)).toEqual([signedOf(P1), signedOf(P2)]);
    expect(out.heroUrl).toBe(signedOf(P2));
  });

  it("signs for a share-link holder of that project", async () => {
    const { store, signed } = fakeStore();
    const out = await photosForViewer(project(), { kind: "share", caseStudyId: CS }, photos, null, { store });
    expect(signed.length).toBe(1);
    expect(out.photos).toHaveLength(2);
  });

  it.each<[string, PhotoViewer]>([
    ["anonymous", { kind: "anonymous" }],
    ["another company", { kind: "member", organizationId: OTHER_ORG }],
    ["a link to another project", { kind: "share", caseStudyId: OTHER_CS }],
  ])("signs nothing for %s", async (_n, viewer) => {
    const { store, signed } = fakeStore();
    const out = await photosForViewer(project(), viewer, photos, priv(P1), { store });
    expect(signed).toEqual([]);
    expect(out).toEqual({ photos: [], heroUrl: null });
  });

  it("passes public URLs through, never re-signs a signed URL, drops foreign ones", async () => {
    const { store, signed } = fakeStore();
    const urls = await resolvePhotoUrls(
      [
        { project: project({ visibility: "public" }), url: pub(P1) },
        { project: project(), url: signedOf(P2) },
        { project: project(), url: priv(`${OTHER_ORG}/${F1}.jpg`) },
        { project: project(), url: null },
      ],
      { kind: "member", organizationId: ORG },
      { store },
    );
    expect(urls).toEqual([pub(P1), null, null, null]);
    expect(signed).toEqual([]);
  });

  it("one batch for many projects, only the allowed ones", async () => {
    const { store, signed } = fakeStore();
    const urls = await resolvePhotoUrls(
      [
        { project: project(), url: priv(P1) },
        { project: project({ id: OTHER_CS, organizationId: OTHER_ORG }), url: priv(`${OTHER_ORG}/${F2}.jpg`) },
      ],
      { kind: "member", organizationId: ORG },
      { store },
    );
    expect(signed).toEqual([[P1]]);
    expect(urls).toEqual([signedOf(P1), null]);
  });

  it("unlisted pages point private photos at the re-checking redirect, not a signed URL", () => {
    const out = proxiedPhotos(CS, [photo(priv(P1), P1), photo(pub(P2), P2, "before")], priv(P1));
    expect(out.photos[0].url).toBe(`/api/projects/${CS}/photo/${F1}`);
    expect(out.photos[1].url).toBe(pub(P2));
    expect(out.heroUrl).toBe(`/api/projects/${CS}/photo/${F1}`);
  });
});

describe("unlisted-photo redirect route", () => {
  const call = (id: string, file: string) =>
    unlistedPhoto(new Request(`https://pmrfp.com/api/projects/${id}/photo/${file}`), { params: Promise.resolve({ id, file }) });

  function withRow(row: Record<string, unknown>) {
    const signed: string[][] = [];
    serviceState.client = {
      from: () => {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
        return q;
      },
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            signed.push(paths);
            return { data: paths.map((p) => ({ path: p, signedUrl: signedOf(p), error: null })), error: null };
          },
        }),
      },
    };
    return signed;
  }

  it("redirects an unlisted project's own photo to a fresh signed URL, uncached", async () => {
    const signed = withRow({ id: CS, organization_id: ORG, status: "published", visibility: "unlisted", photos: [photo(priv(P1), P1)] });
    const res = await call(CS, F1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(signedOf(P1));
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(signed).toEqual([[P1]]);
  });

  it("404s a private project without signing anything", async () => {
    const signed = withRow({ id: CS, organization_id: ORG, status: "published", visibility: "private", photos: [photo(priv(P1), P1)] });
    const res = await call(CS, F1);
    expect(res.status).toBe(404);
    expect(signed).toEqual([]);
  });

  it("404s an unpublished project, a photo that isn't the project's, and bad ids", async () => {
    let signed = withRow({ id: CS, organization_id: ORG, status: "draft", visibility: "unlisted", photos: [photo(priv(P1), P1)] });
    expect((await call(CS, F1)).status).toBe(404);
    signed = withRow({ id: CS, organization_id: ORG, status: "published", visibility: "unlisted", photos: [photo(priv(P1), P1)] });
    expect((await call(CS, F2)).status).toBe(404);
    expect((await call("nope", F1)).status).toBe(404);
    expect(signed).toEqual([]);
  });
});

// ── Moving photos when visibility changes ────────────────────────────

describe("photo moves", () => {
  it("plans moves for photos in the wrong bucket (hero included once)", () => {
    const raw = [photo(pub(P1), P1), photo(priv(P2), P2)];
    expect(planPhotoMoves(raw, pub(P1), "private", ORG)).toEqual([{ path: P1, from: "public", to: "private" }]);
    expect(planPhotoMoves(raw, pub(P1), "public", ORG)).toEqual([{ path: P2, from: "private", to: "public" }]);
    expect(planPhotoMoves([photo(pub(P1), P1)], pub(P1), "public", ORG)).toEqual([]);
  });

  it("rewrites only the URLs of photos that moved, keeping everything else", () => {
    const raw = [photo(pub(P1), P1), photo(pub(P2), P2), { junk: true }];
    const out = applyPhotoMoves(raw, pub(P1), new Map([[P1, "private" as const]]));
    expect((out.photos as ProjectPhoto[])[0].url).toBe(priv(P1));
    expect((out.photos as ProjectPhoto[])[1].url).toBe(pub(P2));
    expect((out.photos as unknown[])[2]).toEqual({ junk: true });
    expect(out.heroUrl).toBe(priv(P1));
  });

  it("public → private: moves the objects out of the public bucket and repoints the row", async () => {
    const row = { id: CS, organization_id: ORG, visibility: "private", photos: [photo(pub(P1), P1), photo(pub(P2), P2)], hero_url: pub(P2) };
    const { db, rows } = fakeDb([row]);
    const { store, where } = fakeStore({ [P1]: "public", [P2]: "public" });
    const res = await syncProjectPhotos(CS, { db, store });
    expect(res.ok).toBe(true);
    expect(res.moved).toHaveLength(2);
    expect(where.get(P1)).toBe("private");
    expect(where.get(P2)).toBe("private");
    expect((rows[0].photos as ProjectPhoto[]).map((p) => p.url)).toEqual([priv(P1), priv(P2)]);
    expect(rows[0].hero_url).toBe(priv(P2));
    // Nothing public is left for the old URLs to reach.
    expect(sanitizePhotos(rows[0].photos, SB)).toEqual([]);
  });

  it("private → public moves them back; a second run is a no-op", async () => {
    const row = { id: CS, organization_id: ORG, visibility: "public", photos: [photo(priv(P1), P1)], hero_url: priv(P1) };
    const { db, updates } = fakeDb([row]);
    const { store } = fakeStore({ [P1]: "private" });
    expect((await syncProjectPhotos(CS, { db, store })).moved).toHaveLength(1);
    expect(row.hero_url).toBe(pub(P1));
    const again = await syncProjectPhotos(CS, { db, store });
    expect(again).toEqual({ ok: true, moved: [], failed: [] });
    expect(updates).toHaveLength(1);
  });

  it("a failed move leaves that photo's URL alone and reports it", async () => {
    const row = { id: CS, organization_id: ORG, visibility: "private", photos: [photo(pub(P1), P1), photo(pub(P2), P2)], hero_url: null };
    const { db } = fakeDb([row]);
    const { store } = fakeStore({ [P1]: "public", [P2]: "public" }, [P2]);
    const res = await syncProjectPhotos(CS, { db, store });
    expect(res.ok).toBe(false);
    expect(res.failed).toEqual([P2]);
    expect(row.photos.map((p) => p.url)).toEqual([priv(P1), pub(P2)]);
  });
});

describe("backfill", () => {
  const rows = () => [
    { id: CS, slug: "roof", organization_id: ORG, visibility: "private", photos: [photo(pub(P1), P1)], hero_url: pub(P1) },
    { id: OTHER_CS, slug: "deck", organization_id: ORG, visibility: "public", photos: [photo(pub(P2), P2)], hero_url: pub(P2) },
  ];

  it("dry run reports what would move and changes nothing", async () => {
    const { db, updates } = fakeDb(rows());
    const { store, where } = fakeStore({ [P1]: "public", [P2]: "public" });
    const r = await backfillProjectPhotos({ apply: false }, { db, store });
    expect(r.scanned).toBe(2);
    expect(r.projects).toEqual([{ id: CS, slug: "roof", visibility: "private", toPrivate: 1, toPublic: 0 }]);
    expect(r.purgeUrls).toEqual([pub(P1)]);
    expect(updates).toEqual([]);
    expect(where.get(P1)).toBe("public");
  });

  it("apply moves them, and re-running finds nothing left", async () => {
    const { db } = fakeDb(rows());
    const { store, where } = fakeStore({ [P1]: "public", [P2]: "public" });
    const r = await backfillProjectPhotos({ apply: true }, { db, store });
    expect(r.photosToPrivate).toBe(1);
    expect(r.failed).toBe(0);
    expect(where.get(P1)).toBe("private");
    expect(where.get(P2)).toBe("public");
    const again = await backfillProjectPhotos({ apply: true }, { db, store });
    expect(again.projects).toEqual([]);
  });
});

// ── "Add a project" tile ─────────────────────────────────────────────

describe("Add a project tile: company members only", () => {
  const session = (orgId: string | null, over: { profile?: string; org?: string } = {}) => ({
    userId: "u1",
    hasTradeAccess: true,
    profile: { status: over.profile ?? "active" },
    organization: orgId ? { id: orgId, status: over.org ?? "active" } : null,
  });

  it("pure rule", () => {
    expect(isProfileMember(null, ORG)).toBe(false);
    expect(isProfileMember(session(null) as never, ORG)).toBe(false);
    expect(isProfileMember(session(OTHER_ORG) as never, ORG)).toBe(false);
    expect(isProfileMember(session(ORG) as never, ORG)).toBe(true);
    expect(isProfileMember(session(ORG, { profile: "suspended" }) as never, ORG)).toBe(false);
    expect(isProfileMember(session(ORG, { org: "suspended" }) as never, ORG)).toBe(false);
    expect(isProfileMember(session(ORG) as never, "")).toBe(false);
  });

  it("server action checks the viewer's own session", async () => {
    sessionState.session = null;
    expect(await isProfileMemberAction(ORG)).toBe(false);
    sessionState.session = session(OTHER_ORG);
    expect(await isProfileMemberAction(ORG)).toBe(false);
    sessionState.session = session(ORG);
    expect(await isProfileMemberAction(ORG)).toBe(true);
    expect(await isProfileMemberAction("not-a-uuid")).toBe(false);
  });

  it("the profile page renders the tile through the member check only", () => {
    const page = readFileSync(join(process.cwd(), "src/app/[lang]/(v3)/directory/[slug]/page.tsx"), "utf8");
    expect(page).toContain("<AddProjectTile organizationId={v.id}");
    expect(page).not.toMatch(/className="add lift"/);
  });
});

// ── Translated server messages ───────────────────────────────────────

describe("server messages", () => {
  it("templates are exactly the English dictionary", () => {
    expect(SERVER_MESSAGE_TEMPLATES).toEqual(portfolioClient.en.serverMessages);
    expect(Object.keys(portfolioClient.fr.serverMessages)).toEqual(Object.keys(portfolioClient.en.serverMessages));
    expect(Object.keys(portfolioClient.es.serverMessages)).toEqual(Object.keys(portfolioClient.en.serverMessages));
  });

  it("matches exact answers and fills {n} / {email}", () => {
    expect(translateServerMessage("Couldn't save. Try again in a minute.")).toEqual({ key: "saveFailed", values: {} });
    expect(translateServerMessage("Up to 24 photos per project. Remove a few and try again.")).toEqual({
      key: "photoLimitPaid",
      values: { n: "24" },
    });
    expect(translateServerMessage("Sent to pat@example.com. You'll see it here once they reply.")).toEqual({
      key: "sent",
      values: { email: "pat@example.com" },
    });
    expect(translateServerMessage("Something new")).toBeNull();
  });

  it("every template is a message the server actually sends", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(join(process.cwd(), "src/lib/projects"));
    walk(join(process.cwd(), "src/app/api/projects"));
    files.push(join(process.cwd(), "src/lib/rate-limit.ts"));
    const source = files
      .filter((f) => !f.endsWith("server-messages.ts"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
      // Template literals: ${max} etc. become {n}/{email} for comparison.
      .replace(/\$\{d\.clientEmail\}/g, "{email}")
      .replace(/\$\{[A-Za-z_.]+\}/g, "{n}")
      .replace(/\\"/g, '"');
    for (const [key, template] of Object.entries(SERVER_MESSAGE_TEMPLATES)) {
      expect(source.includes(template), key).toBe(true);
    }
  });
});
