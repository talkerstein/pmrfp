import { parseFirstTouch, serializeFirstTouch } from "../../src/lib/attribution/cookie.ts";
import { EMAIL_NOTICE_VERSION } from "../../src/lib/consent/email.ts";
import { optedOut } from "../../src/lib/tracking/privacy.ts";

export const syntheticSignupPath = "/api/auth/sign-up/email";
export const syntheticSignupIntentPath = "/__migration/signup-intent";
const fixtureEmail = "profile-signup-19@example.invalid";
const fixtureId = "00000000-0000-4000-8000-000000000019";
const maxBodyBytes = 1024;
const roles = ["trade", "property_manager", "visitor", "supplier", "real_estate_agent", "talent"];
const languages = ["en", "fr", "es"];

export async function syntheticSignupRequest(request, origin) {
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
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some(key => !["name", "email", "password", "role", "lang"].includes(key))
      || input.email !== fixtureEmail || typeof input.name !== "string" || !input.name.trim()
      || input.name.trim().length > 120 || typeof input.password !== "string" || input.password.length < 8
      || new TextEncoder().encode(input.password).byteLength > 72 || !roles.includes(input.role)
      || !languages.includes(input.lang)) {
    throw Error("Invalid synthetic signup fields");
  }
  const fullName = input.name.trim();
  const trackingDisabled = optedOut(request.headers);
  const firstTouch = trackingDisabled ? null : parseFirstTouch(request.headers.get("x-pmrfp-signup-first-touch"));
  const authRequest = new Request(request.url, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: fullName, email: fixtureEmail, password: input.password, callbackURL: "/" }),
  });
  return {
    authRequest,
    intent: {
      fullName, role: input.role, lang: input.lang,
      optedOut: trackingDisabled, firstTouch: firstTouch ? serializeFirstTouch(firstTouch) : null,
      noticeVersion: EMAIL_NOTICE_VERSION,
    },
  };
}

export function syntheticSignupOptions(options, intent) {
  if (typeof options.emailVerification?.sendVerificationEmail !== "function") {
    throw Error("Synthetic verification capture is required");
  }
  return {
    ...options,
    emailAndPassword: { ...options.emailAndPassword, disableSignUp: false, autoSignIn: false },
    emailVerification: { ...options.emailVerification, sendOnSignUp: true },
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
        generateId: input => input.model === "user" ? fixtureId : options.advanced.database.generateId(input),
      },
    },
  };
}

/** Return the original signup choices only to a live verified fixture session. */
export async function readSyntheticSignupIntent(auth, request, db, headers) {
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;
  const expiry = new Date(session?.session?.expiresAt).getTime();
  if (user?.id !== fixtureId || user.email !== fixtureEmail || user.emailVerified !== true || user.banned !== false
      || session.session?.userId !== fixtureId || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return Response.json({ error: "sign_in_required" }, { status: 401, headers });
  }
  const row = await db.prepare("SELECT signupIntent,createdAt FROM user WHERE id=? AND email=?").bind(fixtureId, fixtureEmail).first();
  if (!row?.signupIntent) return Response.json({ error: "signup_intent_missing" }, { status: 409, headers });
  return Response.json({
    user: { id: fixtureId, email: fixtureEmail, emailVerified: true, banned: false },
    session: { userId: fixtureId, expiresAt: session.session.expiresAt },
    signupIntent: { ...JSON.parse(row.signupIntent), signedUpAt: new Date(row.createdAt).toISOString() },
  }, { headers });
}
