/**
 * Runs the open-data command line (src/lib/open-data/cli.ts) from the
 * terminal. The importers are TypeScript that share code with the app (the
 * award-history model, the business-name rule), so this wrapper bundles
 * them first with rolldown (already installed with vitest), then runs the
 * bundle. No other tooling needed.
 *
 *   node scripts/run-open-data.mjs                       # list the commands
 *   node scripts/run-open-data.mjs arcgis                # dry run: all pilot cities
 *   node scripts/run-open-data.mjs arcgis --city=surrey --apply
 *   node scripts/run-open-data.mjs vancouver-awards  C:\data\awarded-contracts.csv
 *   node scripts/run-open-data.mjs vancouver-permits C:\data\issued-building-permits.csv --apply
 *   node scripts/run-open-data.mjs load-federal-seed out/federal-contracts-seed.jsonl --apply
 *   node scripts/run-open-data.mjs footprint
 *
 * Every command is a DRY RUN unless you add --apply. See the header of
 * src/lib/open-data/cli.ts for the full list.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stub = join(root, "scripts", "lib", "next-stub.mjs");
const outFile = join(root, "node_modules", ".cache", "open-data-cli.mjs");
mkdirSync(dirname(outFile), { recursive: true });

const bundle = await rolldown({
  input: join(root, "src", "lib", "open-data", "cli.ts"),
  platform: "node",
  cwd: root,
  resolve: { alias: { "@": join(root, "src"), "next/cache": stub, "next/headers": stub, react: stub } },
  // The app's modules import next/react only for server rendering (stubbed above); never called here.
  external: [/^node:/, "@supabase/supabase-js", "server-only"],
  logLevel: "warn",
});
await bundle.write({ file: outFile, format: "esm" });
await bundle.close();

process.chdir(process.cwd());
await import(pathToFileURL(outFile).href);
