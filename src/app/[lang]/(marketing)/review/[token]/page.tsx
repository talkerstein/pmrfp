import type { Metadata } from "next";
import Link from "@/i18n/link";
import Image from "next/image";
import { Container } from "@/components/container";
import { ReviewForm } from "@/components/projects/review-form";
import { lookupInvite } from "@/lib/reviews/invite";
import { isOptimizablePhoto } from "@/lib/projects/photos";
import { SITE } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";

// Per-link state (open / used) must never be served from a cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = getDictionary(hasLocale(lang) ? lang : "en").misc.review;
  return {
    title: t.metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * /review/[token] — the one-time link a trade's client gets by email. No
 * account: the token is the credential. Invalid, used or not-yet-migrated
 * all land on the same friendly message.
 */
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  await setLangFrom(params);
  const t = getT("misc").review;
  const { token } = await params;
  const invite = await lookupInvite(token);

  if (invite.state !== "open") {
    const [mistakeBefore, mistakeAfter] = t.mistake.split("{email}");
    return (
      <Container size="narrow" className="py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {invite.state === "used" ? t.usedTitle : t.brokenTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invite.state === "used" ? t.usedBody : t.brokenBody}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {mistakeBefore}
            <a href={`mailto:${SITE.email}`} className="font-medium text-teal-ink hover:underline">{SITE.email}</a>
            {mistakeAfter}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-teal-ink hover:underline">
            {t.goHome}
          </Link>
        </div>
      </Container>
    );
  }

  const [byBefore, byAfter] = t.by.split("{trade}");
  return (
    <Container size="narrow" className="py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow text-teal-600">{t.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {fmt(t.title, { trade: invite.tradeName })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {fmt(t.intro, { trade: invite.tradeName })}
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          {invite.heroUrl && (
            <div className="relative aspect-[16/9] bg-secondary">
              <Image src={invite.heroUrl} alt={invite.projectTitle} fill sizes="(min-width: 640px) 576px, 100vw" className="object-cover" priority unoptimized={!isOptimizablePhoto(invite.heroUrl)} />
            </div>
          )}
          <div className="p-4">
            <p className="font-semibold leading-snug">{invite.projectTitle}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {byBefore}
              {invite.tradeSlug ? (
                <Link href={`/directory/${invite.tradeSlug}`} className="text-teal-ink hover:underline" target="_blank">
                  {invite.tradeName}
                </Link>
              ) : (
                invite.tradeName
              )}
              {byAfter}
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
