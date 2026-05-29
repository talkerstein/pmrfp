import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/container";
import { ContactForm } from "@/components/public/contact-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact PMRFP",
  description: "Get in touch with the PMRFP team — for trades, property managers, and sourcing help.",
};

export default function ContactPage() {
  return (
    <Container size="narrow" className="py-14">
      <Eyebrow>Contact</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Get in touch</h1>
      <p className="mt-3 text-muted-foreground">
        Questions about listing your trade company, posting an RFP, or sourcing vendors? Send us a
        note and we&apos;ll get back to you. You can also email{" "}
        <a href={`mailto:${SITE.email}`} className="text-gold-700 hover:underline">
          {SITE.email}
        </a>
        .
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </Container>
  );
}
