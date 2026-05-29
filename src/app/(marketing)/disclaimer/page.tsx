import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { COPY, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: `Important information about how ${SITE.name} works and what it does not guarantee.`,
};

const LAST_UPDATED = "May 29, 2026";

function DisclaimerBlock({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {label}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <section className="bg-background">
      <Container size="narrow" className="py-16 sm:py-24">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground">
          Disclaimer
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8 flex gap-4 rounded-xl border border-gold-400/60 bg-gold-100/40 p-6">
          <ShieldAlert className="size-6 shrink-0 text-gold-600" />
          <p className="text-base font-medium leading-relaxed text-foreground">
            {COPY.disclaimer}
          </p>
        </div>

        <p className="mt-10 leading-relaxed text-muted-foreground">
          {SITE.name} connects trade companies with property managers, builders,
          and owners. We are not a broker, procurement agent, or legal advisor,
          and we do not act on behalf of either party. The following statements
          apply at specific points in the Service.
        </p>

        <DisclaimerBlock label="When you sign up" text={COPY.signupDisclaimer} />
        <DisclaimerBlock
          label="For property managers posting an RFP"
          text={COPY.pmPostingDisclaimer}
        />
        <DisclaimerBlock
          label="For trades expressing interest"
          text={COPY.interestDisclaimer}
        />

        <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
          Questions about this disclaimer? Reach us at{" "}
          <Link
            href={`mailto:${SITE.email}`}
            className="font-medium text-gold-600 underline underline-offset-4"
          >
            {SITE.email}
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}
