import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import {
  isSignupFixtureEmail, magicSignupEmail, readSyntheticAuthBody, syntheticSignupRequest, withStoredSignupIntent,
} from "./synthetic-signup.mjs";

export const magicSignupPath = "/__migration/sign-up/magic-link";
export const magicSigninPath = "/api/auth/sign-in/magic-link";
export const magicVerifyPath = "/api/auth/magic-link/verify";
const prefix = "synthetic-magic-capture:";
const lifetime = 300;
const tokenPattern = /^[A-Za-z]{32}$/;

async function captureIdentifier(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return prefix + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function pluginOptions(options, sendMagicLink, disableSignUp) {
  return {
    ...options,
    plugins: [...options.plugins, magicLink({ expiresIn: lifetime, storeToken: "hashed", disableSignUp, sendMagicLink })],
  };
}

/** Local capture only. Better Auth consumes its hashed token when it creates the session. */
export async function handleSyntheticMagicLink(request, options, db, totalAccounts) {
  const url = new URL(request.url);
  const origin = url.origin;
  if (url.pathname === magicVerifyPath) {
    const token = url.searchParams.get("token");
    if (request.method !== "GET" || !tokenPattern.test(token ?? "") || [...url.searchParams.keys()].length !== 1) {
      return Response.json({ error: "invalid_link" }, { status: 400 });
    }
    const receipt = await db.prepare("SELECT value,expiresAt FROM verification WHERE identifier=?")
      .bind(await captureIdentifier(token)).first();
    if (!receipt || !(Date.parse(receipt.expiresAt) > Date.now())) {
      return Response.json({ error: "invalid_link" }, { status: 401 });
    }
    const capture = JSON.parse(receipt.value);
    if (!isSignupFixtureEmail(capture.email)) return Response.json({ error: "invalid_link" }, { status: 401 });
    const canCreate = capture.email === magicSignupEmail && capture.intent?.method === "magic_link";
    const existing = await db.prepare("SELECT emailVerified,banned FROM user WHERE email=?").bind(capture.email).first();
    if ((!existing && !canCreate) || (existing && (existing.emailVerified !== 1 || existing.banned === 1))) {
      return Response.json({ error: "invalid_link" }, { status: 401 });
    }
    if (!existing && totalAccounts >= 19) return Response.json({ error: "synthetic_account_limit" }, { status: 409 });
    const authOptions = pluginOptions(options, async () => { throw Error("Unexpected magic-link send"); }, !canCreate);
    const auth = betterAuth(canCreate ? withStoredSignupIntent(authOptions, capture.intent, capture.email) : authOptions);
    return auth.handler(request);
  }

  const isSignup = url.pathname === magicSignupPath;
  let email, name, intent;
  try {
    if (isSignup) {
      const signup = await syntheticSignupRequest(request, origin, "magic_link");
      ({ email, name } = await signup.authRequest.json());
      intent = signup.intent;
    } else {
      const input = await readSyntheticAuthBody(request, origin);
      if (Object.keys(input).length !== 1 || !isSignupFixtureEmail(input.email)) throw Error("Unexpected magic-link request");
      email = input.email;
    }
  } catch {
    return Response.json({ error: "invalid_link_request" }, { status: 400 });
  }

  const existing = await db.prepare("SELECT emailVerified,banned FROM user WHERE email=?").bind(email).first();
  const sendNothing = (!isSignup && !existing) || (existing && (existing.emailVerified !== 1 || existing.banned === 1));
  if (sendNothing) return Response.json({ status: true });
  // Leave one account slot for the independently reserved password fixture.
  if (!existing && totalAccounts >= 19) return Response.json({ error: "synthetic_account_limit" }, { status: 409 });
  const auth = betterAuth(pluginOptions(options, async ({ email: recipient, url: link, token }) => {
    const target = new URL(link);
    if (recipient !== email || !tokenPattern.test(token) || target.origin !== origin || target.pathname !== magicVerifyPath
        || target.searchParams.get("token") !== token || target.searchParams.get("callbackURL") !== "/") {
      throw Error("Unexpected synthetic magic link");
    }
    const id = prefix + email;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lifetime * 1000).toISOString();
    await db.prepare(`
      INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET identifier=excluded.identifier,value=excluded.value,
        expiresAt=excluded.expiresAt,updatedAt=excluded.updatedAt
    `).bind(id, await captureIdentifier(token), JSON.stringify({ email, url: link, intent: existing ? null : intent }),
      expiresAt, now.toISOString(), now.toISOString()).run();
  }, true));
  return auth.handler(new Request(origin + magicSigninPath, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email, name, callbackURL: "/" }),
  }));
}
