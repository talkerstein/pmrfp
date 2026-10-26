import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Regression for the 2026-10-26 incident: /major-projects/[slug] (ISR,
 * revalidate = 86400) called getSession(), which reads cookies(), and every
 * request returned 500 (digest DYNAMIC_SERVER_USAGE). A page that sets
 * `revalidate` is rendered statically, so nothing it renders may reach
 * request-scoped data. This walks each such page's static import graph (plus
 * the layouts above it) and fails on any module that reads the request.
 *
 * Viewer-specific state belongs in a client island that asks an API route
 * (components/major-projects/viewer, components/trial/trial-banner).
 */
const SRC = resolve(__dirname, "../../src");
const APP = join(SRC, "app");

/** Modules whose job is to read the request (cookies/headers/session). */
const REQUEST_MODULES = [
  "next/headers",
  "@/lib/supabase/server",
  "@/lib/access/access",
  "@/lib/visitor-geo.server",
  "@/lib/entitlement/server",
  "@/lib/entitlement/actions",
];

/**
 * Files that import a request module but are known not to call it while a
 * static page renders (only inside a server action or on-demand function).
 * Adding to this list needs a reason.
 */
const ALLOWED = new Map<string, string>([
  // Server action passed to a <form action>; runs on submit, never during render.
  ["components/leads/trial.tsx", "imports startTrialAction (a server action) for a form"],
  ["components/major-projects/viewer.tsx", "client island: imports startTrialAction for a form"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  return null;
}

const IMPORT_RE = /(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function specsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

const rel = (f: string) => relative(SRC, f).split(sep).join("/");

/** Names a file imports from a request module (cookies, getSession, ...). */
function requestNamesIn(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const names: string[] = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!REQUEST_MODULES.includes(m[2])) continue;
    for (const part of m[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (n) names.push(n);
    }
  }
  return names;
}

/**
 * Every page/component module reachable from `entry` that CALLS something it
 * imported from a request module. lib/ data modules are not walked: they
 * mix cookie-bound and public readers, so the page-level call is the signal
 * (a page calling getSession()/cookies() itself, or through a component).
 */
function offenders(entry: string): string[] {
  const seen = new Set<string>();
  const bad: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    // A "use client" module is not rendered statically on the server.
    if (/^\s*["']use client["']/.test(src.slice(0, 200)) && f !== entry) continue;
    for (const n of requestNamesIn(f)) {
      if (!ALLOWED.has(rel(f)) && new RegExp(`\b${n}\s*\(`).test(src)) bad.push(`${rel(f)} calls ${n}()`);
    }
    for (const spec of specsOf(f)) {
      const next = resolveImport(spec, f);
      if (next && !rel(next).startsWith("lib/")) stack.push(next);
    }
  }
  return bad;
}

function layoutsAbove(file: string): string[] {
  const out: string[] = [];
  let dir = dirname(file);
  while (dir.startsWith(APP)) {
    for (const n of ["layout.tsx", "template.tsx"]) {
      const p = join(dir, n);
      if (existsSync(p) && p !== file) out.push(p);
    }
    if (dir === APP) break;
    dir = dirname(dir);
  }
  return out;
}

const isrPages = walk(APP).filter((f) => {
  if (!/[\\/](page\.tsx|route\.ts)$/.test(f)) return false;
  const src = readFileSync(f, "utf8");
  const m = src.match(/export const revalidate\s*=\s*(\d+)/);
  // Only the SSG/ISR class can 500: a revalidate page WITHOUT generateStaticParams that touches
  // cookies() just becomes a dynamic route (ƒ), a revalidate page WITH it throws DYNAMIC_SERVER_USAGE.
  return Boolean(m && Number(m[1]) > 0) && /generateStaticParams/.test(src) && !/export const dynamic\s*=\s*["']force-dynamic["']/.test(src);
});

describe("ISR pages never read the request while rendering", () => {
  it("finds the ISR routes", () => {
    expect(isrPages.length).toBeGreaterThan(10);
    expect(isrPages.map(rel)).toContain("app/[lang]/(v3)/major-projects/[slug]/page.tsx");
  });

  for (const page of isrPages) {
    it(rel(page), () => {
      const bad = new Set<string>();
      for (const entry of [page, ...layoutsAbove(page)]) for (const b of offenders(entry)) bad.add(b);
      expect([...bad]).toEqual([]);
    });
  }

  it("the major-projects detail page has no searchParams and no session", () => {
    const src = readFileSync(join(APP, "[lang]/(v3)/major-projects/[slug]/page.tsx"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/searchParams|getSession|cookies\(|headers\(/);
  });
});
