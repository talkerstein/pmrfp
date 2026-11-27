import "server-only";
import { randomUUID } from "node:crypto";
import { DEFAULT_SIGNUP_ROLE } from "./oauth";
import { EMAIL_NOTICE_VERSION } from "@/lib/consent/email";
import { normalizeEmail } from "@/lib/dedupe/email";
import { D1ApiError, UUID, type D1Binding } from "@/lib/d1/contracts";
import type { Locale } from "@/i18n/config";
import { nativeAuthAuthority } from "../../../workers/d1-api/customer-password-reset";
import { customerAppAuthority, mailboxKey } from "../../../workers/d1-api/customer-signup";

interface Identity {
  email: string;
  subject: string;
  lang: Locale;
  allowCreate: boolean;
}

/** A verified Google identity may create a profile only via the signup flow. */
export async function provisionVpsGoogleProfile(auth: D1Binding, app: D1Binding, identity: Identity) {
  const { email, subject, lang, allowCreate } = identity;
  const account = "google:" + subject;
  const mailbox = normalizeEmail(email);
  const signedUp = new Date().toISOString();
  const id = randomUUID();

  if (allowCreate) {
    if (!(await app.prepare(`SELECT 1 AS ready WHERE ${customerAppAuthority}`).first())) {
      throw new D1ApiError(503, "customer_app_authority_unavailable");
    }
    const authWrites = await auth.batch([
      auth.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,banned)
        SELECT ?,'',?,1,?,?,'user',0 WHERE ${nativeAuthAuthority}
          AND NOT EXISTS(SELECT 1 FROM user WHERE ${mailboxKey}=?)
          AND NOT EXISTS(SELECT 1 FROM account WHERE id=?)
          AND NOT EXISTS(SELECT 1 FROM _auth_pending_signup
            WHERE mailbox=? AND (confirmed=1 OR expires_at>CAST(strftime('%s','now') AS INTEGER)*1000))`)
        .bind(id, email, signedUp, signedUp, mailbox, account, mailbox),
      auth.prepare(`INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt)
        SELECT ?,?,'google',id,?,? FROM user WHERE id=?`).bind(account, subject, signedUp, signedUp, id),
      auth.prepare(`INSERT INTO _auth_source_metadata(user_id,metadata)
        SELECT id,? FROM user WHERE id=?`).bind(JSON.stringify({
          raw_user_meta_data: {}, raw_app_meta_data: { pmrfp_google_signup: true, locale: lang },
        }), id),
    ]);
    if (authWrites.length !== 3 || authWrites.some(write => !write.success)) {
      throw new D1ApiError(503, "google_signup_unavailable");
    }
  }

  // The authenticated provider binding and server-owned intent survive a partial
  // profile write and let the same verified Google account retry safely.
  const registration = await auth.prepare(`SELECT u.id,u.createdAt AS created,
      json_extract(m.metadata,'$.raw_app_meta_data.locale') AS locale
    FROM account a JOIN user u ON u.id=a.userId JOIN _auth_source_metadata m ON m.user_id=u.id
    WHERE a.id=? AND a.accountId=? AND a.providerId='google' AND u.email=? AND u.emailVerified=1
      AND (u.banned=0 OR (u.banned=1 AND julianday(u.banExpires)<=julianday('now')))
      AND json_extract(m.metadata,'$.raw_app_meta_data.pmrfp_google_signup')=1 AND ${nativeAuthAuthority}`)
    .bind(account, subject, email).first<{ id: string; created: string; locale: Locale }>();
  if (!registration || !UUID.test(registration.id)) return null;

  const writes = await app.batch([
    app.prepare(`SELECT CASE WHEN ${customerAppAuthority}
      AND NOT EXISTS(SELECT 1 FROM users_profile WHERE (id=? AND email<>?) OR (${mailboxKey}=? AND id<>?))
      THEN 1 ELSE json('customer_profile_conflict') END`).bind(registration.id, email, mailbox, registration.id),
    app.prepare("INSERT INTO _auth_users(id) VALUES(?) ON CONFLICT(id) DO NOTHING").bind(registration.id),
    app.prepare(`INSERT INTO users_profile(id,email,primary_role) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(registration.id, email, DEFAULT_SIGNUP_ROLE),
    app.prepare(`INSERT INTO email_consents(user_id,scope,source,wording_version,lang,created_at)
      VALUES(?,'service','google_signup',?,?,?) ON CONFLICT(user_id,scope,source) DO NOTHING`)
      .bind(registration.id, EMAIL_NOTICE_VERSION, registration.locale, registration.created),
  ]);
  if (writes.length !== 4 || writes.some(write => !write.success)) throw new D1ApiError(503, "google_profile_unavailable");
  return email;
}
