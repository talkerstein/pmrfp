import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards for the French/Spanish sideways-scroll bug: translated button labels
 * run longer than English, so v3 buttons must be able to wrap inside their
 * column, and button rows must be able to wrap onto a second line.
 */
const css = (f: string) => readFileSync(join(process.cwd(), "src/components", f), "utf8").replace(/\r\n/g, "\n");
/** Every declaration block whose selector list is exactly `selector`, merged in order. */
function decls(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(source)); ) {
    if (m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim() !== selector) continue;
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}

describe("v3 buttons never force a page wider than the screen", () => {
  it.each([
    ["home-v3/home-v3.css", ".v3-pill"],
    ["v3-pages/landing.css", ".v3p .btn"],
  ])("%s %s wraps a too-long label instead of overflowing", (file, sel) => {
    const d = decls(css(file), sel);
    expect(d["white-space"]).toBe("normal");
    // Last declaration wins: the whole box (padding included) is capped at its column.
    expect(d["max-width"]).toBe("stretch");
    expect(d["flex-shrink"]).toBe("0");
  });

  it("the home hero's button row and columns can shrink and wrap", () => {
    const s = css("home-v3/home-v3.css");
    expect(decls(s, ".v3-hero-ctas")["flex-wrap"]).toBe("wrap");
    expect(decls(s, ".v3-hero-main")["min-width"]).toBe("0");
    expect(decls(s, ".v3-hero-side")["min-width"]).toBe("0");
    expect(decls(s, ".v3-search")["min-width"]).toBe("0");
  });

  it("the pricing table's scroll box contains its screen-reader-only spans", () => {
    // Without a positioned ancestor, the absolute .v3-sr spans escape the clip
    // and made /pricing 285px too wide on phones.
    expect(decls(css("v3-pages/v3-pages.css"), ".vp-table-scroll")["position"]).toBe("relative");
  });
});
