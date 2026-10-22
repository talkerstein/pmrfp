import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseBearerHeader } from "@/lib/access/request-session";
import { D1ApiError } from "./contracts";
import { D1SavedRfpsClient } from "./client";

/** Explicit opt-in, shared by the action and page so reads and writes never split providers. */
export function d1SavedRfpsEnabled(): boolean {
  const mode = process.env.PMRFP_SAVED_RFPS_BACKEND || "supabase";
  if (mode !== "supabase" && mode !== "d1") throw new D1ApiError(503, "invalid_backend_configuration");
  if (mode === "d1" && process.env.VERCEL_ENV === "production") throw new D1ApiError(503, "production_cutover_not_enabled");
  return mode === "d1";
}
export function d1SavedRfpsClient(): D1SavedRfpsClient {
  return new D1SavedRfpsClient({
    url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "",
    allowLocal: process.env.NODE_ENV !== "production",
  });
}
/** Cookie access tokens are only forwarded. The Worker checks them with Supabase Auth on every request. */
export async function d1AccessToken(request?: Request): Promise<string> {
  const bearer = parseBearerHeader(request?.headers.get("authorization"));
  if (bearer.kind === "invalid") throw new D1ApiError(401, "sign_in_required");
  if (bearer.kind === "token") return bearer.token;
  const { data, error } = await (await createClient()).auth.getSession();
  if (error || !data.session?.access_token) throw new D1ApiError(401, "sign_in_required");
  return data.session.access_token;
}
