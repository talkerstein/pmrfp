import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";

export const metadata: Metadata = {
  title: "RFP listing updated",
  robots: { index: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  ok: {
    title: "Your listing is live again",
    body: "Thanks — your RFP is back on the public board, and we've extended its deadline. When this one passes, we'll check in with you again.",
  },
  notlive: {
    title: "This RFP is already closed",
    body: "This listing has been awarded, closed, or archived, so there's nothing to keep live. You can post a fresh RFP any time from your dashboard.",
  },
  invalid: {
    title: "That link isn't valid",
    body: "This keep-it-live link doesn't match a current listing. Head to your dashboard to manage your RFPs.",
  },
  error: {
    title: "Something went wrong",
    body: "We couldn't update your listing just now. Please try again, or manage it from your dashboard.",
  },
};

export default async function RfpKeptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "ok";
  const days = sp.days ?? "30";
  const m = MESSAGES[status] ?? MESSAGES.ok;
  const body = status === "ok" ? m.body.replace("extended its deadline", `extended its deadline by ${days} days`) : m.body;

  return (
    <section className="border-b border-border">
      <Container className="py-20 text-center">
        <Eyebrow>PMRFP</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{body}</p>
        <div className="mt-8">
          <Link
            href="/pm-dashboard/rfps"
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Go to my RFPs
          </Link>
        </div>
      </Container>
    </section>
  );
}
