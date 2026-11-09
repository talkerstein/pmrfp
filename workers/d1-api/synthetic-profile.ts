import { D1ApiError, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { signUpSchema, signupProfileSchema } from "../../src/lib/validations";
import { MAX_COOKIE_LEN, parseFirstTouch } from "../../src/lib/attribution/cookie";
import { signupAttributionRow } from "../../src/lib/attribution/signup";
import { z } from "zod";
import { verifyNativeSyntheticIdentity, type NativeSyntheticAuthConfig } from "./native-auth";

const storedSignupSchema = signupProfileSchema.extend({
  lang: z.enum(["en", "fr", "es"]),
  optedOut: z.boolean(),
  signedUpAt: z.iso.datetime(),
  firstTouch: z.string().max(MAX_COOKIE_LEN).nullable(),
  noticeVersion: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$/).max(40),
});
const emptyProfileRequest = z.strictObject({});

/** Bridge a verified sandbox identity to its first application profile. */
export async function provisionSyntheticProfile(
  request: Request, db: D1Binding, auth: NativeSyntheticAuthConfig, fetcher: typeof fetch, requireSignupIntent = false,
): Promise<{ created: boolean }> {
  const marker = await db.prepare("SELECT value FROM _d1_sandbox WHERE key='dataset'").first<{ value: string }>();
  if (marker?.value !== "synthetic-only") throw new D1ApiError(503, "native_sandbox_required");

  const identity = await verifyNativeSyntheticIdentity(request, auth, fetcher, requireSignupIntent);
  const email = identity.email.toLowerCase();
  const body = await readD1Json(request);
  const storedSignup = requireSignupIntent ? storedSignupSchema.safeParse(identity.signupIntent) : null;
  if (requireSignupIntent && !emptyProfileRequest.safeParse(body).success) {
    throw new D1ApiError(400, "invalid_profile_request");
  }
  if (storedSignup && !storedSignup.success) throw new D1ApiError(503, "signup_intent_unavailable");
  const input = signupProfileSchema.safeParse(storedSignup?.success
    ? { fullName: storedSignup.data.fullName, role: storedSignup.data.role }
    : body);
  if (!input.success || email.length > 254 || !signUpSchema.shape.email.safeParse(email).success) {
    throw new D1ApiError(400, "invalid_profile_request");
  }

  // The collision check and both inserts share one write transaction. An
  // existing profile belongs to its original user and is never updated here.
  const writes = [
    db.prepare(`
      INSERT INTO _auth_users(id)
      SELECT ? WHERE NOT EXISTS (
        SELECT 1 FROM users_profile WHERE id=? OR lower(email)=?
      )
      ON CONFLICT(id) DO NOTHING
    `).bind(identity.id, identity.id, email),
    db.prepare(`
      INSERT INTO users_profile(id,email,full_name,primary_role)
      SELECT id,?,?,? FROM _auth_users
      WHERE id=? AND NOT EXISTS (
        SELECT 1 FROM users_profile WHERE lower(email)=?
      )
      ON CONFLICT(id) DO NOTHING
    `).bind(email, input.data.fullName ?? "", input.data.role, identity.id, email),
  ];
  if (storedSignup?.success) {
    const signup = storedSignup.data;
    const attribution = signupAttributionRow({
      userId: identity.id, method: "password", role: signup.role, optedOut: signup.optedOut,
      ft: parseFirstTouch(signup.firstTouch), fallback: { lang: signup.lang }, signedUpAt: signup.signedUpAt,
      ownHosts: ["pmrfp.com", "www.pmrfp.com"],
    });
    const columns = Object.keys(attribution);
    const values = Object.values(attribution).map(value => typeof value === "boolean" ? Number(value) : value);
    writes.push(
      db.prepare(`
        INSERT INTO email_consents(user_id,scope,source,wording_version,lang,created_at)
        SELECT id,'service','signup_form',?,?,? FROM users_profile
        WHERE id=? AND lower(email)=? AND status='active'
        ON CONFLICT(user_id,scope,source) DO NOTHING
      `).bind(signup.noticeVersion, signup.lang, signup.signedUpAt, identity.id, email),
      db.prepare(`
        INSERT INTO signup_attribution(${columns.join(",")})
        SELECT ${columns.map(() => "?").join(",")} FROM users_profile
        WHERE id=? AND lower(email)=? AND status='active'
        ON CONFLICT(user_id) DO NOTHING
      `).bind(...values, identity.id, email),
    );
  }
  const results = await db.batch<{ email: string; status: string }>([
    ...writes,
    db.prepare("SELECT email,status FROM users_profile WHERE id=?").bind(identity.id),
  ]);
  if (results.length !== writes.length + 1 || results.some(result => !result.success)) {
    throw new D1ApiError(503, "profile_provision_unavailable");
  }
  const profile = results.at(-1)?.results[0];
  if (!profile || profile.email.toLowerCase() !== email) throw new D1ApiError(409, "profile_conflict");
  if (profile.status !== "active") throw new D1ApiError(403, "account_inactive");
  return { created: results[1].meta.changes === 1 };
}
