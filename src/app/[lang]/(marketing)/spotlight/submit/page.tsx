import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/container";
import { SpotlightSubmitForm } from "@/components/spotlight/submit-form";

export const metadata: Metadata = {
  title: "Submit your Project Spotlight",
  robots: { index: false, follow: false },
};

export default async function SpotlightSubmitPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  return (
    <Container size="narrow" className="py-14">
      <Eyebrow>Project Spotlight</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Thanks. Now tell us about the project</h1>
      <p className="mt-3 text-muted-foreground">
        Write 400 to 800 words about one finished project: what the client needed, what you did, and the result. Add 1 to 4 photos. We&apos;ll review it and publish within 2 business days. We also emailed you this link, so you can come back to it later.
      </p>
      {session_id ? (
        <SpotlightSubmitForm sessionId={session_id} />
      ) : (
        <p className="mt-8 rounded-lg border p-4 text-sm">
          This page needs the link from your payment confirmation email. Can&apos;t find it? Email info@pmrfp.com and we&apos;ll sort it out.
        </p>
      )}
    </Container>
  );
}
