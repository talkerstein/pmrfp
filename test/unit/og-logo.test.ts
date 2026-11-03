import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { companyInitials, loadOgLogo, resolveLogoUrl } from "@/lib/og/logo";

const SUPABASE = "https://abc.supabase.co";
const BUCKET = `${SUPABASE}/storage/v1/object/public/logos/org/logo.webp`;

describe("resolveLogoUrl", () => {
  it("allows our own /logos folder and the Supabase logos bucket", () => {
    expect(resolveLogoUrl("/logos/maple.png", SUPABASE)).toBe("https://pmrfp.com/logos/maple.png");
    expect(resolveLogoUrl(BUCKET, SUPABASE)).toBe(BUCKET);
  });

  it("refuses everything else", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "https://evil.example/logo.png",
      "/api/internal",
      "/logos/../api/internal",
      "//evil.example/logos/x.png",
      "/\\evil.example/logos/x.png",
      `${SUPABASE}/storage/v1/object/public/portfolio/x.png`,
      BUCKET.replace("https:", "http:"),
      "http://localhost/logos/x.png",
      "file:///etc/passwd",
    ]) {
      expect(resolveLogoUrl(bad, SUPABASE)).toBeNull();
    }
  });

  it("refuses bucket URLs when Supabase isn't configured, or its URL is unreadable", () => {
    expect(resolveLogoUrl(BUCKET, "")).toBeNull();
    expect(resolveLogoUrl(BUCKET, "not a url")).toBeNull();
  });
});

describe("companyInitials", () => {
  it("takes up to two initials and skips symbols", () => {
    expect(companyInitials("Maple Electric Supply")).toBe("ME");
    expect(companyInitials("A & B Roofing")).toBe("AB");
    expect(companyInitials("  solo  ")).toBe("S");
    expect(companyInitials("Élite Plomberie")).toBe("ÉP");
    expect(companyInitials("&&&")).toBe("?");
  });
});

describe("loadOgLogo", () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: Buffer, headers: Record<string, string> = {}, status = 200) => {
    const fn = vi.fn(async () => new Response(new Uint8Array(body), { status, headers }));
    vi.stubGlobal("fetch", fn);
    return fn;
  };
  const dimensions = (src: string) => sharp(Buffer.from(src.split(",")[1], "base64")).metadata();

  it("turns a WebP into a PNG the renderer can read, sized to fit the tile", async () => {
    serve(await sharp({ create: { width: 800, height: 400, channels: 3, background: "#123456" } }).webp().toBuffer());
    const logo = await loadOgLogo("/logos/x.webp");
    expect(logo?.src.startsWith("data:image/png;base64,")).toBe(true);
    const meta = await dimensions(logo!.src);
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([logo!.width, logo!.height]);
    expect(logo!.width).toBeLessThanOrEqual(460);
    expect(logo!.height).toBeLessThanOrEqual(216);
  });

  it("trims a logo's margins", async () => {
    const mark = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).png().toBuffer();
    serve(
      await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } })
        .composite([{ input: mark }])
        .png()
        .toBuffer(),
    );
    const logo = await loadOgLogo("/logos/x.png");
    expect([logo?.width, logo?.height]).toEqual([216, 216]);
    const { dominant } = await sharp(Buffer.from(logo!.src.split(",")[1], "base64")).stats();
    expect(dominant.r).toBeGreaterThan(200);
    expect(dominant.g).toBeLessThan(60);
  });

  it("still returns a one-colour image, which can't be trimmed", async () => {
    serve(await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ffffff" } }).png().toBuffer());
    expect(await loadOgLogo("/logos/x.png")).not.toBeNull();
  });

  it("returns null instead of failing the card", async () => {
    serve(Buffer.from("not an image"));
    expect(await loadOgLogo("/logos/x.png")).toBeNull();

    serve(Buffer.from("missing"), {}, 404);
    expect(await loadOgLogo("/logos/x.png")).toBeNull();

    serve(Buffer.from("x"), { "content-length": String(6 * 1024 * 1024) });
    expect(await loadOgLogo("/logos/x.png")).toBeNull();

    serve(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(await loadOgLogo("/logos/x.png")).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timed out"))));
    expect(await loadOgLogo("/logos/x.png")).toBeNull();
  });

  it("never fetches a URL outside the allowlist", async () => {
    const fetchMock = serve(Buffer.from("x"));
    expect(await loadOgLogo("https://evil.example/logo.png")).toBeNull();
    expect(await loadOgLogo(null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
