import { parseFirstTouch, serializeFirstTouch } from "../../src/lib/attribution/cookie.ts";
import { EMAIL_NOTICE_VERSION } from "../../src/lib/consent/email.ts";
import { optedOut } from "../../src/lib/tracking/privacy.ts";

export const syntheticSignupPath = "/api/auth/sign-up/email";
export const syntheticSignupIntentPath = "/__migration/signup-intent";
const fixtureEmail = "profile-signup-19@example.invalid";
const fixtureId = "00000000-0000-4000-8000-000000000019";
export const magicSignupEmail = "profile-link-20@example.invalid";
const signupFixtures = new Map([
  [fixtureEmail, fixtureId],
  [magicSignupEmail, "00000000-0000-4000-8000-000000000020"],
]);
const maxBodyBytes = 1024;
const roles = ["trade", "property_manager", "visitor", "supplier", "real_estate_agent", "talent"];
const languages = ["en", "fr", "es"];
export const isSignupFixtureEmail = email => signupFixtures.has(email);

export async function readSyntheticAuthBody(request, origin) {
  if (request.method !== "POST" || new URL(request.url).search || request.headers.get("origin") !== origin
      || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw Error("Invalid synthetic signup request");
  }
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing synthetic signup body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) throw Error("Synthetic signup body exceeds limit");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid synthetic auth body");
  return input;
}

export async function syntheticSignupRequest(request, origin, method = "password") {
  const input = await readSyntheticAuthBody(request, origin);
  const passwordSignup = method === "password";
  const email = passwordSignup ? fixtureEmail : magicSignupEmail;
  if (Object.keys(input).some(key => !["name", "email", "password", "role", "lang"].includes(key))
      || input.email !== email || typeof input.name !== "string" || !input.name.trim()
      || input.name.trim().length > 120 || !roles.includes(input.role) || !languages.includes(input.lang)
      || (passwordSignup && (typeof input.password !== "string" || input.password.length < 8
        || new TextEncoder().encode(input.password).byteLength > 72))
      || (!passwordSignup && input.password !== undefined)) {
    throw Error("Invalid synthetic signup fields");
  }
  const fullName = input.name.trim();
  const trackingDisabled = optedOut(request.headers);
  const firstTouch = trackingDisabled ? null : parseFirstTouch(request.headers.get("x-pmrfp-signup-first-touch"));
  const authRequest = new Request(request.url, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: fullName, email, password: input.password, callbackURL: "/" }),
  });
  return {
    authRequest,
    intent: {
      fullName, role: input.role, lang: input.lang, method,
      optedOut: trackingDisabled, firstTouch: firstTouch ? serializeFirstTouch(firstTouch) : null,
      noticeVersion: EMAIL_NOTICE_VERSION,
    },
  };
}

export function syntheticSignupOptions(options, intent) {
  if (typeof options.emailVerification?.sendVerificationEmail !== "function") {
    throw Error("Synthetic verification capture is required");
  }
  return withStoredSignupIntent({
    ...options,
    emailAndPassword: { ...options.emailAndPassword, disableSignUp: false, autoSignIn: false },
    emailVerification: { ...options.emailVerification, sendOnSignUp: true },
  }, intent, fixtureEmail);
}

export function withStoredSignupIntent(options, intent, email) {
  const id = signupFixtures.get(email);
  if (!id) throw Error("Unexpected signup fixture");
  return {
    ...options,
    user: {
      additionalFields: {
        signupIntent: { type: "string", required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: { create: { before: async user => ({
        data: { ...user, signupIntent: JSON.stringify(intent) },
      }) } },
    },
    advanced: {
      ...options.advanced,
      database: {
        ...options.advanced.database,
        generateId: input => input.model === "user" ? id : options.advanced.database.generateId(input),
      },
    },
  };
}

/** Return the original signup choices only to a live verified fixture session. */
export async function readSyntheticSignupIntent(auth, request, db, headers) {
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;
  const id = signupFixtures.get(user?.email);
  const expiry = new Date(session?.session?.expiresAt).getTime();
  if (!id || user.id !== id || user.emailVerified !== true || user.banned !== false
      || session.session?.userId !== id || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return Response.json({ error: "sign_in_required" }, { status: 401, headers });
  }
  const row = await db.prepare("SELECT signupIntent,createdAt FROM user WHERE id=? AND email=?").bind(id, user.email).first();
  if (!row?.signupIntent) return Response.json({ error: "signup_intent_missing" }, { status: 409, headers });
  return Response.json({
    user: { id, email: user.email, emailVerified: true, banned: false },
    session: { userId: id, expiresAt: session.session.expiresAt },
    signupIntent: { ...JSON.parse(row.signupIntent), signedUpAt: new Date(row.createdAt).toISOString() },
  }, { headers });
}
