import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { BadgeEmbed } from "@/components/public/badge-embed";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/access/access";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your PMRFP Verified Vendor Badge",
  description:
    "Show clients you're a credible commercial vendor with the PMRFP badge — a verified-status mark that links back to your profile. Free for members.",
  alternates: { canonical: "/badge" },
};

export default async function BadgePage() {
  const session = await getSession();
  const memberSlug = session?.organization?.slug ?? null;
  // Demo / not-signed-in: preview with a sample vendor so the page is useful to everyone.
  const slug = memberSlug ?? "northline-electrical";

  const h = await headers();
  const host = h.get("host") ?? "pmrfp.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
  const profileUrl = `${base}/directory/${slug}`;

  return (
    <Container size="narrow" className="py-14">
      <Eyebrow>Member benefit</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your PMRFP Verified Vendor badge
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Add the {SITE.name} badge to your website and email signature. It signals third-party
        credibility to property managers and builders — and links back to your {SITE.name} profile,
        sending you traffic.
      </p>

      {!memberSlug && (
        <div className="mt-6 rounded-lg border border-dashed border-gold-300 bg-gold-50/60 p-4 text-sm">
          {session ? (
            <>Complete your company profile to generate your own badge. </>
          ) : (
            <>You&apos;re viewing a sample badge. </>
          )}
          <Link href="/sign-up" className="font-medium text-gold-700 hover:underline">
            Join {SITE.name}
          </Link>{" "}
          to get yours.
        </div>
      )}

      <div className="mt-10">
        <BadgeEmbed base={base} slug={slug} profileUrl={profileUrl} />
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Badge tiers</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your badge gets stronger as you complete your profile.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Tier icon={<Star className="size-5" />} title="Listed Vendor" desc="You have an approved profile in the PMRFP directory." />
          <Tier icon={<BadgeCheck className="size-5" />} title="Verified Vendor" desc="Admin-verified company — the credibility upgrade most clients look for." />
          <Tier icon={<ShieldCheck className="size-5" />} title="+ Insured" desc="Insurance details on file — shown as 'Insured' on your badge." />
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={memberSlug ? "/dashboard/company" : "/sign-up"} className={buttonVariants()}>
          {memberSlug ? "Update my profile" : "Get my badge"}
        </Link>
        <Link href={`/directory/${slug}`} className={buttonVariants({ variant: "outline" })}>
          View profile
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        The badge reflects your current {SITE.name} status and does not guarantee work or constitute
        an endorsement of any specific project outcome.
      </p>
    </Container>
  );
}

function Tier({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-gold-600">{icon}</span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
