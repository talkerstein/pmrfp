/**
 * The thirteen /buyers/<province> URL segments, kept as plain data so the
 * proxy can turn away /buyers/<made-up> without loading the buyer directory.
 * test/unit/bot-guard.test.ts checks this list against PROVINCE_NAMES.
 */
export const BUYER_PROVINCE_SLUGS: ReadonlySet<string> = new Set([
  "ontario",
  "british-columbia",
  "alberta",
  "nova-scotia",
  "manitoba",
  "saskatchewan",
  "quebec",
  "new-brunswick",
  "prince-edward-island",
  "newfoundland-and-labrador",
  "yukon",
  "northwest-territories",
  "nunavut",
]);
