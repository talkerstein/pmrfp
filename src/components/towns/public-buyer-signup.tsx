import { SignupTop } from "@/components/home-v3/signup-ui";
import { publicBuyerSignUpAction } from "@/lib/towns/actions";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

/**
 * /sign-up?role=public_buyer: the public-buyer sign-up ("Public buyer
 * (town, city, school board, housing provider)"), reached from a town page's
 * "Claim this page free". One field: the work email; Supabase emails a
 * sign-in link that lands on the claim step. Kept apart from the general
 * role picker on purpose. Server-rendered (inside the v3 layout's header and
 * footer): errors come back in the URL.
 */
export function PublicBuyerSignUp({
  lang,
  claim,
  claimName,
  sent,
  error,
}: {
  lang: Locale;
  /** "ontario/town-of-cobourg", when the visitor came from a page. */
  claim: string | null;
  /** "Town of Cobourg, Ontario". */
  claimName: string | null;
  sent: boolean;
  error: string | null;
}) {
  const t = getT("towns").signup;
  const su = getDictionary(lang).v3Pages.signup;
  const L = (p: string) => localizePath(p, lang);
  const errorText = error && error in t.errors ? t.errors[error as keyof typeof t.errors] : null;
  const next = claim ? `/onboarding?claim=${encodeURIComponent(claim)}` : "/onboarding";
  return (
    <div className="v3-su-main">
      <div className="v3-wrap" style={{ paddingTop: 28, paddingBottom: 96 }}>
        <div className="v3-su-card" style={{ maxWidth: 720, margin: "0 auto" }} data-signup="public-buyer">
          <SignupTop eyebrow={t.eyebrow} have={<>{t.have} <a href={L(`/sign-in?next=${encodeURIComponent(next)}`)}>{t.signIn}</a></>} />
          <div className="v3-su-pane">
            <h1 className="v3-su-h1">{sent ? t.sentTitle : t.title}</h1>
            <p className="v3-su-sub">{sent ? t.sentBody : t.sub}</p>
            {claimName && !sent && (
              <p className="v3-su-sub" data-claiming>
                <b>{t.claiming}:</b> {claimName}
              </p>
            )}
          </div>
          {!sent && (
            <form action={publicBuyerSignUpAction} className="v3-su-pane">
              {errorText && <div role="alert" className="v3-su-err">{errorText}</div>}
              <input type="hidden" name="lang" value={lang} />
              {claim && <input type="hidden" name="claim" value={claim} />}
              <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
              <p className="v3-su-note" data-role="public_buyer">{t.role}</p>
              <label className="v3-su-fld">
                <span>{t.workEmail}</span>
                <input name="email" type="email" required autoComplete="email" maxLength={254} placeholder="clerk@yourtown.ca" />
              </label>
              <p className="v3-su-note">{t.emailHint}</p>
              <button type="submit" className="v3-su-go" style={{ marginTop: 14 }}>{t.submit}</button>
            </form>
          )}
          <div className="v3-su-pane">
            <ol className="v3-su-note" style={{ paddingLeft: 18 }}>
              {t.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p className="v3-su-note">
              {t.notBuyer} <a href={L("/sign-up")}>{t.notBuyerLink}</a>
            </p>
          </div>
          <div className="v3-su-foot"><div className="v3-su-legal" style={{ marginTop: 0 }}>{su.disclaimer}</div></div>
        </div>
      </div>
    </div>
  );
}
