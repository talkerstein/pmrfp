import { constants, openSync, closeSync, fstatSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const filename = process.argv[2];
if (!filename) {
  console.error("Usage: node deploy/vps/check-payment-env.mjs <local-env-file>");
  process.exit(2);
}

try {
  const file = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let settings;
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.size > 128 * 1024) {
      throw new Error("Invalid env file");
    }
    settings = parseEnv(readFileSync(file, "utf8"));
  } finally {
    closeSync(file);
  }

  const checks = {
    productionSite: /^https:\/\/pmrfp\.com\/?$/.test(settings.NEXT_PUBLIC_SITE_URL ?? ""),
    stripeServerKey: /^(sk|rk)_live_[A-Za-z0-9_]{16,}$/.test(settings.STRIPE_SECRET_KEY ?? ""),
    stripeWebhookSecret: /^whsec_[A-Za-z0-9]{16,}$/.test(settings.STRIPE_WEBHOOK_SECRET ?? ""),
    tradeProAnnualPrice: /^price_[A-Za-z0-9]+$/.test(settings.STRIPE_PRICE_TRADE_PRO_ANNUAL ?? ""),
  };
  // This checks file shape only. Real Stripe authentication and webhook replay
  // are separate release checks. No credential values are printed.
  console.log(JSON.stringify(checks));
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
} catch {
  console.error("Could not read a valid local env file. Values were not displayed.");
  process.exitCode = 2;
}
