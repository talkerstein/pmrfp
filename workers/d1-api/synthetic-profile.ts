import { D1ApiError, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { signUpSchema, signupProfileSchema } from "../../src/lib/validations";
import { verifyNativeSyntheticIdentity, type NativeSyntheticAuthConfig } from "./native-auth";

/** Bridge a verified sandbox identity to its first application profile. */
export async function provisionSyntheticProfile(
  request: Request, db: D1Binding, auth: NativeSyntheticAuthConfig, fetcher: typeof fetch,
): Promise<{ created: boolean }> {
  const marker = await db.prepare("SELECT value FROM _d1_sandbox WHERE key='dataset'").first<{ value: string }>();
  if (marker?.value !== "synthetic-only") throw new D1ApiError(503, "native_sandbox_required");

  const identity = await verifyNativeSyntheticIdentity(request, auth, fetcher);
  const email = identity.email.toLowerCase();
  const input = signupProfileSchema.safeParse(await readD1Json(request));
  if (!input.success || email.length > 254 || !signUpSchema.shape.email.safeParse(email).success) {
    throw new D1ApiError(400, "invalid_profile_request");
  }

  // The collision check and both inserts share one write transaction. An
  // existing profile belongs to its original user and is never updated here.
  const results = await db.batch<{ email: string; status: string }>([
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
    db.prepare("SELECT email,status FROM users_profile WHERE id=?").bind(identity.id),
  ]);
  const [identityInsert, profileInsert, profileRead] = results;
  if (!identityInsert?.success || !profileInsert?.success || !profileRead?.success) {
    throw new D1ApiError(503, "profile_provision_unavailable");
  }
  const profile = profileRead.results[0];
  if (!profile || profile.email.toLowerCase() !== email) throw new D1ApiError(409, "profile_conflict");
  if (profile.status !== "active") throw new D1ApiError(403, "account_inactive");
  return { created: profileInsert.meta.changes === 1 };
}
