import "server-only";
import { redirect } from "next/navigation";
import { localizePath, type Locale } from "@/i18n/config";
import { isCustomerD1Staging, isVpsNativeAccountRecovery, isVpsNativeAccountSignup } from "./staging-config";

/** Signup and recovery stay with the credential authority during mirroring. */
export function redirectSourceAccountFlow(
  path: "/sign-up" | "/forgot-password",
  lang: Locale,
  intent: { role?: string; kind?: string; plan?: string; interval?: string } = {},
) {
  if (!isCustomerD1Staging() || process.env.PMRFP_VPS_SOURCE_ACCOUNT_FLOWS !== "enabled") return;
  if (path === "/forgot-password" && isVpsNativeAccountRecovery()) return;
  if (path === "/sign-up" && intent.role !== "public_buyer" && isVpsNativeAccountSignup()) return;
  const target = new URL(localizePath(path, lang), "https://pmrfp.com");
  for (const key of ["role", "kind", "plan", "interval"] as const) {
    const value = intent[key];
    if (typeof value === "string" && /^[a-z0-9_-]{1,40}$/.test(value)) {
      target.searchParams.set(key, value);
    }
  }
  redirect(target.href);
}
