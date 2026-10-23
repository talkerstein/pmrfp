import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * scripts/vercel-ignore-build.sh against a throwaway git repo.
 * Exit 0 = skip the build, exit 1 = build.
 */
const script = path.resolve(__dirname, "../../scripts/vercel-ignore-build.sh").replace(/\\/g, "/");
let dir: string;
let c0: string; // base commit
let cDocs: string; // docs-only change on top of c0
let cApp: string; // app change on top of cDocs
let cMixed: string; // docs + app change on top of c0 (separate branch)

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}
function write(rel: string, body: string) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
}
function commit(msg: string) {
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", msg);
  return git("rev-parse", "HEAD");
}
function run(env: Record<string, string>) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.VERCEL_GIT_COMMIT_SHA;
  delete cleanEnv.VERCEL_GIT_PREVIOUS_SHA;
  return spawnSync("bash", [script], { cwd: dir, env: { ...cleanEnv, ...env }, encoding: "utf8" }).status;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ignore-build-"));
  git("init", "-q", "-b", "main");
  write("src/app.ts", "a\n");
  write("docs/readme.md", "a\n");
  c0 = commit("base");

  write("docs/readme.md", "b\n");
  write("README.md", "b\n");
  cDocs = commit("docs only");

  write("src/app.ts", "b\n");
  cApp = commit("app change");

  git("checkout", "-q", "-b", "mixed", c0);
  write("docs/readme.md", "c\n");
  write("src/app.ts", "c\n");
  cMixed = commit("mixed");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("vercel-ignore-build.sh", () => {
  it("builds when the commit equals the previously deployed commit (redeploy)", () => {
    git("checkout", "-q", cDocs);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cDocs, VERCEL_GIT_PREVIOUS_SHA: cDocs })).toBe(1);
  });

  it("builds when the previous SHA is unset or empty", () => {
    git("checkout", "-q", cDocs);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cDocs })).toBe(1);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cDocs, VERCEL_GIT_PREVIOUS_SHA: "" })).toBe(1);
  });

  it("builds when the previous SHA is not in the repo", () => {
    git("checkout", "-q", cDocs);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cDocs, VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40) })).toBe(1);
  });

  it("skips a docs-only diff", () => {
    git("checkout", "-q", cDocs);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cDocs, VERCEL_GIT_PREVIOUS_SHA: c0 })).toBe(0);
  });

  it("builds when app files changed", () => {
    git("checkout", "-q", cApp);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cApp, VERCEL_GIT_PREVIOUS_SHA: cDocs })).toBe(1);
  });

  it("builds a mixed docs + app diff", () => {
    git("checkout", "-q", cMixed);
    expect(run({ VERCEL_GIT_COMMIT_SHA: cMixed, VERCEL_GIT_PREVIOUS_SHA: c0 })).toBe(1);
  });
});
