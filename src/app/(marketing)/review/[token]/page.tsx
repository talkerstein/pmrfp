import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/container";
import { ReviewForm } from "@/components/projects/review-form";
import { lookupInvite } from "@/lib/reviews/invite";
import { SITE } from "@/lib/site";

// Per-link state (open / used) must never be served from a cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leave a review",
  robots: { index: false, follow: false },
};

/**
 * /review/[token] — the one-time link a trade's client gets by email. No
 * account: the token is the credential. Invalid, used or not-yet-migrated
 * all land on the same friendly message.
 */
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await lookupInvite(token);

  if (invite.state !== "open") {
    return (
      <Container size="narrow" className="py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {invite.state === "used" ? "This review link has been used" : "This review link isn't working"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invite.state === "used"
              ? "Each link works once, and a review has already been sent with this one. Thanks for taking the time."
              : "It may have been used already, or copied only in part. Try the button in the email again."}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Think that&apos;s a mistake? Email{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-teal-ink hover:underline">{SITE.email}</a>.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-teal-ink hover:underline">
            Go to {SITE.name}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow text-teal-600">Review request</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          How did {invite.tradeName} do?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invite.tradeName} asked for your honest review of this job. It takes about two minutes.
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          {invite.heroUrl && (
            <div className="relative aspect-[16/9] bg-secondary">
              <Image src={invite.heroUrl} alt={invite.projectTitle} fill sizes="(min-width: 640px) 576px, 100vw" className="object-cover" priority />
            </div>
          )}
          <div className="p-4">
            <p className="font-semibold leading-snug">{invite.projectTitle}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              by{" "}
              {invite.tradeSlug ? (
                <Link href={`/directory/${invite.tradeSlug}`} className="text-teal-ink hover:underline" target="_blank">
                  {invite.tradeName}
                </Link>
              ) : (
                invite.tradeName
              )}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ReviewForm token={token} defaultName={invite.clientName} tradeName={invite.tradeName} />
        </div>
      </div>
    </Container>
  );
}
