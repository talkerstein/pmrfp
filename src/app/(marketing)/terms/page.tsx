import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { COPY, PRICING, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms governing your use of ${SITE.name}.`,
};

const LAST_UPDATED = "May 29, 2026";

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

export default function TermsPage() {
  return (
    <section className="bg-background">
      <Container size="narrow" className="py-16 sm:py-24">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>

        <LegalSection title="1. Acceptance of Terms">
          <p>
            By accessing or using {SITE.name} (the &ldquo;Service&rdquo;), you
            agree to be bound by these Terms of Service. If you do not agree to
            these terms, you may not use the Service. These terms apply to all
            users, including trade companies, contractors, property managers,
            builders, and building owners.
          </p>
        </LegalSection>

        <LegalSection title="2. Description of Service">
          <p>
            {SITE.name} is a platform for posting RFPs and finding trades, serving
            the Canadian commercial property market. The Service allows trade
            companies to publish profiles and monitor opportunities, and allows
            property managers, builders, and owners to post requests for
            proposals (RFPs) and discover vendors.
          </p>
        </LegalSection>

        <LegalSection title="3. Accounts & Eligibility">
          <p>
            You must provide accurate, complete information when creating an
            account and keep it up to date. You are responsible for safeguarding
            your account credentials and for all activity that occurs under your
            account. You must be authorized to act on behalf of any company you
            represent on the Service.
          </p>
        </LegalSection>

        <LegalSection title="4. Subscriptions & Billing">
          {process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY ? (
            <p>
              Trade Pro is offered on two billing intervals: ${PRICING.proAnnual}{" "}
              {PRICING.currency} per year (annual), or ${PRICING.proMonthly}{" "}
              {PRICING.currency} per month (monthly). Each renews automatically
              at the end of the current term unless cancelled. You may cancel at
              any time; cancellation takes effect at the end of your current
              billing period, and you retain access until then. Fees are
              non-refundable except where required by law. We may change pricing
              on a prospective basis with reasonable notice. You may switch
              between annual and monthly via your billing portal; switching
              takes effect at the end of your current billing period.
            </p>
          ) : (
            <p>
              Trade Pro is offered at ${PRICING.proAnnual} {PRICING.currency}{" "}
              per year and renews automatically at the end of each annual term
              unless cancelled. You may cancel at any time; cancellation takes
              effect at the end of your current billing period, and you retain
              access until then. Fees are non-refundable except where required
              by law. We may change pricing on a prospective basis with
              reasonable notice.
            </p>
          )}
          <p>
            Property managers, builders, and owners may post RFPs at no cost.
            Free directory listings are available to trade companies without a
            paid subscription.
          </p>
        </LegalSection>

        <LegalSection title="5. Acceptable Use">
          <p>
            You agree not to misuse the Service, including by posting false,
            misleading, spam, infringing, or unlawful content; scraping or
            harvesting data; attempting to gain unauthorized access; or using the
            Service to harass other users. We may edit, reject, or remove
            content that violates these terms.
          </p>
        </LegalSection>

        <LegalSection title="6. No Guarantee of Work">
          <p>{COPY.disclaimer}</p>
        </LegalSection>

        <LegalSection title="7. Content & Listings">
          <p>
            You retain ownership of the content you submit, and you grant{" "}
            {SITE.name} a non-exclusive licence to host, display, and distribute
            that content as needed to operate the Service. You are solely
            responsible for the accuracy and legality of your listings, profiles,
            and RFPs. We may moderate, edit, or remove listings that are
            incomplete, misleading, spam, or inappropriate.
          </p>
        </LegalSection>

        <LegalSection title="8. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, {SITE.name} and its
            affiliates are not liable for any indirect, incidental,
            consequential, or punitive damages, or for lost profits, revenue,
            data, or business opportunities, arising from your use of the
            Service. The Service is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind.
          </p>
        </LegalSection>

        <LegalSection title="9. Termination">
          <p>
            We may suspend or terminate your access to the Service at any time if
            you violate these terms or if we discontinue the Service. You may
            stop using the Service and close your account at any time.
          </p>
        </LegalSection>

        <LegalSection title="10. Changes to These Terms">
          <p>
            We may update these terms from time to time. When we make material
            changes, we will update the &ldquo;last updated&rdquo; date above and,
            where appropriate, provide additional notice. Continued use of the
            Service after changes take effect constitutes acceptance of the
            revised terms.
          </p>
        </LegalSection>

        <LegalSection title="11. Contact">
          <p>
            Questions about these terms? Reach us at{" "}
            <Link
              href={`mailto:${SITE.email}`}
              className="font-medium text-teal-600 underline underline-offset-4"
            >
              {SITE.email}
            </Link>
            .
          </p>
        </LegalSection>
      </Container>
    </section>
  );
}
