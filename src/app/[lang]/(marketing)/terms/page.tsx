import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Container, Eyebrow } from "@/components/container";
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

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-4 leading-relaxed text-muted-foreground">
        {children}
      </div>
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
  return (
    <section className="bg-background">
      <Container size="narrow" className="py-16 sm:py-24">
        <Eyebrow>{m.legal.eyebrow}</Eyebrow>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
          {t.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {fmt(m.legal.lastUpdated, { date: updated })}
        </p>
        {m.legal.translationNote && (
          <p className="mt-4 text-sm italic text-muted-foreground">{m.legal.translationNote}</p>
        )}

        <LegalSection title={t.acceptance.title}>
          <p>{t.acceptance.body}</p>
        </LegalSection>

        <LegalSection title={t.description.title}>
          <p>{t.description.body}</p>
        </LegalSection>

        <LegalSection title={t.accounts.title}>
          <p>{t.accounts.body}</p>
        </LegalSection>

        <LegalSection title={t.billing.title}>
          {process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY ? (
            <p>{fmt(t.billing.withMonthly, price)}</p>
          ) : (
            <p>{fmt(t.billing.annualOnly, price)}</p>
          )}
          <p>{t.billing.free}</p>
        </LegalSection>

        <div id="founding-500" className="scroll-mt-24">
          <LegalSection title={getT("founding").termsSectionTitle}>
            <FoundingTermsList />
          </LegalSection>
        </div>

        <LegalSection title={t.use.title}>
          <p>{t.use.body}</p>
        </LegalSection>

        <LegalSection title={t.noGuarantee.title}>
          <p>{m.copy.disclaimer}</p>
        </LegalSection>

        <LegalSection title={t.content.title}>
          <p>{t.content.body}</p>
        </LegalSection>

        <LegalSection title={t.liability.title}>
          <p>{t.liability.body}</p>
        </LegalSection>

        <LegalSection title={t.termination.title}>
          <p>{t.termination.body}</p>
        </LegalSection>

        <LegalSection title={t.changes.title}>
          <p>{t.changes.body}</p>
        </LegalSection>

        <LegalSection title={t.contact.title}>
          <p>
            {contactBefore}
            <Link
              href={`mailto:${SITE.email}`}
              className="font-medium text-teal-600 underline underline-offset-4"
            >
              {SITE.email}
            </Link>
            {contactAfter}
          </p>
        </LegalSection>
      </Container>
    </section>
  );
}
