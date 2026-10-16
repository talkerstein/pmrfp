import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, roleHome } from "@/lib/access/access";
import { V3Shell } from "@/components/home-v3/shell";
import { SignupTop } from "@/components/home-v3/signup-ui";
import { VisitorUpgradeForm } from "@/components/forms/visitor-upgrade-form";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  return { title: getDictionary(l).auth.visitorUpgrade.meta, robots: { index: false, follow: false } };
}

/**
 * "Run a business? List it free in 2 minutes." The place a "just looking"
 * (visitor) account switches to a business listing: from the header link,
 * from /dashboard (requireRole sends visitors here) or from onboarding.
 */
export default async function ListBusinessPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const session = await requireUser();
  const role = session.profile.primary_role;
  // Only visitors have something to switch; everyone else carries on.
  if (role !== "visitor") {
    const listing = role === "trade" || role === "supplier";
    redirect(localizePath(listing && !session.profile.onboarding_completed ? "/onboarding" : roleHome(role), lang));
  }
  const t = getT("auth").visitorUpgrade;
  const su = getT("v3Pages").signup;
  return (
    <V3Shell lang={lang}>
      <div className="v3-su-main">
        <div className="v3-wrap" style={{ paddingTop: 28, paddingBottom: 96 }}>
          <div className="v3-su-card" style={{ maxWidth: 760, margin: "0 auto" }}>
            <SignupTop eyebrow={t.eyebrow} />
            <div className="v3-su-pane">
              <h1 className="v3-su-h1">{t.heading}</h1>
              <p className="v3-su-sub">{t.intro}</p>
            </div>
            <div className="v3-su-pane" style={{ paddingBottom: 8 }}>
              <VisitorUpgradeForm roles={{ trade: su.roles.trade, supplier: su.roles.supplier }} />
            </div>
            <div className="v3-su-foot"><div className="v3-su-legal" style={{ marginTop: 0 }}>{su.disclaimer}</div></div>
          </div>
        </div>
      </div>
    </V3Shell>
  );
}
