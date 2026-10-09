import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";
import { getDictionary, type Messages } from "@/i18n/dictionaries";

/**
 * Regression guard for the invisible "Sign in" button on forum threads.
 * The v3 stylesheets used to paint every link navy from unlayered CSS, which
 * beats Tailwind utilities, so shadcn button links (bg-primary +
 * text-primary-foreground) rendered navy on navy with no visible label.
 */

const root = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

/** CSS with every @layer block removed, i.e. only the unlayered rules. */
function unlayered(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@layer", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    const open = css.indexOf("{", at);
    const semi = css.indexOf(";", at);
    if (semi !== -1 && (open === -1 || semi < open)) {
      i = semi + 1; // `@layer a, b;` statement
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

describe("v3 link colour rules", () => {
  const files = ["src/components/v3-pages/landing.css", "src/components/home-v3/home-v3.css"];
  for (const f of files) {
    it(`${f}: the blanket link colour is layered so Tailwind text utilities win`, () => {
      const css = root(f);
      // A bare scope + `a` selector (optionally :hover) that sets a colour.
      const blanket = /(^|[},\s])\.(v3p|pmrfp-v3)\s+a(:hover)?\s*\{[^}]*\bcolor\s*:/m;
      expect(css).toMatch(blanket); // still styled...
      expect(unlayered(css)).not.toMatch(blanket); // ...but not from unlayered CSS
    });
  }
});

let lang: Locale = "en";
vi.mock("@/i18n/server", () => ({
  getLang: () => lang,
  getT: <N extends keyof Messages>(ns: N) => getDictionary(lang)[ns],
}));
vi.mock("@/i18n/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("VerifyPanel", () => {
  const locales: Locale[] = ["en", "fr", "es"];
  for (const l of locales) {
    it(`${l}: both buttons carry a non-empty label and the primary keeps its contrast utilities`, async () => {
      lang = l;
      const { VerifyPanel } = await import("@/components/forum/parts");
      const t = getDictionary(l).forum.verify;
      for (const signedIn of [false, true]) {
        const html = renderToStaticMarkup(<VerifyPanel signedIn={signedIn} next="/forum/x/y" />);
        const links = [...html.matchAll(/<a [^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ cls: m[1], label: m[2] }));
        expect(links.length).toBe(signedIn ? 1 : 2);
        for (const a of links) expect(a.label.trim().length).toBeGreaterThan(0);
        const primary = links[0];
        expect(primary.label).toBe(signedIn ? t.cta : t.signIn);
        expect(primary.cls).toContain("bg-primary");
        expect(primary.cls).toContain("text-primary-foreground");
        // Panel text is pinned, not theme tokens that go pale under .dark.
        expect(html).not.toContain("text-muted-foreground");
      }
    });
  }
});
