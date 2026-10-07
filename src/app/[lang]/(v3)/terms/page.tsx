import type { Metadata } from "next";
import Link from "@/i18n/link";
import { SH2, SimplePage } from "@/components/v3/simple";
import { PRICING, SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";
import { FoundingTermsList } from "@/components/founding/terms-list";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).misc.terms.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/terms") };
}

const LAST_UPDATED = "May 29, 2026";
const LAST_UPDATED_ISO = "2026-05-29";

/** One numbered section of the legal text (wording unchanged, layout only). */
function LegalSection({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <SH2 no={no} sm>{title}</SH2>
      <div className="s-legal">{children}</div>
    </section>
  );
}

export default async function TermsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const m = getT("misc");
  const t = m.terms;
  const updated =
    lang === "en" ? LAST_UPDATED : formatDate(LAST_UPDATED_ISO, lang, { day: "numeric", month: "long", year: "numeric" });
  const price = { annual: PRICING.proAnnual, monthly: PRICING.proMonthly, currency: PRICING.currency };
  const [contactBefore, contactAfter] = t.contact.body.split("{email}");
  let n = 0;
  return (
    <SimplePage lang={lang} current="terms" group="legal" title={t.title} lead={fmt(m.legal.lastUpdated, { date: updated })}>
        <p className="s-meta">{m.legal.eyebrow}</p>
        {m.legal.translationNote && (
          <p className="s-note">{m.legal.translationNote}</p>
        )}

        <LegalSection no={++n} title={t.acceptance.title}>
          <p>{t.acceptance.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.description.title}>
          <p>{t.description.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.accounts.title}>
          <p>{t.accounts.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.billing.title}>
          {process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY ? (
            <p>{fmt(t.billing.withMonthly, price)}</p>
          ) : (
            <p>{fmt(t.billing.annualOnly, price)}</p>
          )}
          <p>{t.billing.free}</p>
        </LegalSection>

        <div id="founding-500" className="scroll-mt-24">
          <LegalSection no={++n} title={getT("founding").termsSectionTitle}>
            <FoundingTermsList />
          </LegalSection>
        </div>

        <LegalSection no={++n} title={t.use.title}>
          <p>{t.use.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.noGuarantee.title}>
          <p>{m.copy.disclaimer}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.content.title}>
          <p>{t.content.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.liability.title}>
          <p>{t.liability.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.termination.title}>
          <p>{t.termination.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.changes.title}>
          <p>{t.changes.body}</p>
        </LegalSection>

        <LegalSection no={++n} title={t.contact.title}>
          <p>
            {contactBefore}
            <Link
              href={`mailto:${SITE.email}`}
              
            >
              {SITE.email}
            </Link>
            {contactAfter}
          </p>
        </LegalSection>
    </SimplePage>
  );
}
