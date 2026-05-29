import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses, and protects your information.`,
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

export default function PrivacyPage() {
  return (
    <section className="bg-background">
      <Container size="narrow" className="py-16 sm:py-24">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-6 leading-relaxed text-muted-foreground">
          {SITE.name} respects your privacy. This policy explains what
          information we collect, how we use it, and the choices you have. It is
          written with Canadian privacy expectations, including PIPEDA, in mind.
        </p>

        <LegalSection title="Information We Collect">
          <p>
            We collect information you provide directly, such as your name,
            company details, email address, service categories, regions, and the
            content of profiles, RFPs, and messages. We also collect limited
            technical information automatically, such as device and browser data
            and usage activity, when you interact with the Service.
          </p>
        </LegalSection>

        <LegalSection title="How We Use It">
          <p>
            We use your information to operate and improve the Service, including
            to match trades with relevant opportunities, display directory
            listings and RFPs, send transactional and matching notifications,
            process subscriptions, provide support, and maintain security.
          </p>
        </LegalSection>

        <LegalSection title="Cookies & Analytics">
          <p>
            We use cookies and similar technologies to keep you signed in,
            remember preferences, and understand how the Service is used.
            Aggregated analytics help us improve performance and features. You
            can control cookies through your browser settings, though some
            features may not function without them.
          </p>
        </LegalSection>

        <LegalSection title="Data Storage">
          <p>
            Account and platform data is stored using Supabase, our managed
            database and authentication provider. We take reasonable steps to
            ensure data is handled securely by our infrastructure providers.
          </p>
        </LegalSection>

        <LegalSection title="Sharing">
          <p>
            We do not sell your personal information. Information you choose to
            publish — such as your company profile or an RFP — is visible to
            other users as part of the Service. We may share data with service
            providers who help us operate the platform (for example, hosting,
            payments, and email), and where required by law.
          </p>
        </LegalSection>

        <LegalSection title="Your Rights">
          <p>
            Under PIPEDA and applicable Canadian privacy law, you may request
            access to the personal information we hold about you, ask us to
            correct it, or request its deletion, subject to legal and operational
            limits. To exercise these rights, contact us using the details below.
          </p>
        </LegalSection>

        <LegalSection title="Security">
          <p>
            We use administrative, technical, and physical safeguards designed to
            protect your information. No method of transmission or storage is
            completely secure, so we cannot guarantee absolute security, but we
            work to protect your data and respond promptly to any incident.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Questions or privacy requests? Reach us at{" "}
            <Link
              href={`mailto:${SITE.email}`}
              className="font-medium text-gold-600 underline underline-offset-4"
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
