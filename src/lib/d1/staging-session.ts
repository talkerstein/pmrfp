import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { handleNativeAuthPreview, nativePreviewTokenPattern } from "./native-auth-preview";
import { stagingEmail, stagingUserId } from "./staging-config";

const cookieName = "__Host-pmrfp-staging";
const cookieOptions = { path: "/", httpOnly: true, secure: true, sameSite: "lax" as const };
const internalOrigin = "https://staging-auth.invalid";

async function operation(name: string, token?: string, body?: string) {
  const request = new Request(internalOrigin, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { origin: internalOrigin, "content-type": "application/json" } : {}),
      ...(token ? { cookie: "pmrfp-native-preview=" + token } : {}),
    },
    body,
  });
  return handleNativeAuthPreview(request, name, process.env);
}

async function isStagingIdentity(response: Response) {
  if (!response.ok) return false;
  const body = await response.json();
  return body.user?.id === stagingUserId && body.user?.email === stagingEmail;
}

export async function signInToStaging(email: string, password: string) {
  if (email !== stagingEmail) return false;
  const response = await operation("sign-in", undefined, JSON.stringify({ email, password }));
  if (!await isStagingIdentity(response)) return false;
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const token = cookie.startsWith("pmrfp-native-preview=") ? cookie.slice("pmrfp-native-preview=".length) : "";
  if (!nativePreviewTokenPattern.test(token)) return false;
  (await cookies()).set(cookieName, token, { ...cookieOptions, maxAge: 900 });
  return true;
}

async function readToken() {
  const token = (await cookies()).get(cookieName)?.value;
  return token && nativePreviewTokenPattern.test(token) ? token : undefined;
}

export const stagingSessionActive = cache(async () => {
  const token = await readToken();
  return Boolean(token && await isStagingIdentity(await operation("session", token)));
});

export async function signOutOfStaging() {
  const token = await readToken();
  if (token) await operation("sign-out", token, "{}");
  (await cookies()).set(cookieName, "", { ...cookieOptions, maxAge: 0 });
}

export async function stagingSavedRfps(input?: string) {
  const token = await readToken();
  if (!token || !await isStagingIdentity(await operation("session", token))) {
    return Response.json({ error: "sign_in_required" }, { status: 401 });
  }
  return operation("saved-rfps", token, input);
}
