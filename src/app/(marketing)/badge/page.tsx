import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BadgeCheck, Code2, Mail, ShieldCheck, Star } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { BadgeEmbed } from "@/components/public/badge-embed";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/access/access";
import { getBadgeInfo } from "@/lib/badge/data";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Website Badge for Commercial Trades",
  description:
    "Add the free PMRFP badge to your website and email signature. Property managers who click it see your company profile — trades, regions, insurance — which links back to your site.",
  alternates: { canonical: "/badge" },
};

export default async function BadgePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const [session, { company }] = await Promise.all([getSession(), searchParams]);
  const memberSlug = session?.organization?.slug ?? null;
  // ?company=<slug> — the link in the badge email, so a listed company can
  // grab its own code without an account. Only approved, active listings
  // resolve (getBadgeInfo); the code is just a public link to a public
  // profile, so nothing here is private.
  const linked = !memberSlug && company ? await getBadgeInfo(company) : null;
  const companySlug = linked?.found ? linked.slug : null;
  // Not signed in and no ?company=: show a generic sample. The placeholder
  // slug resolves to no listing, so the badge renders as a plain "Listed
  // Vendor" seal and the profile link is obviously a placeholder.
  const isSample = !memberSlug && !companySlug;
  const slug = memberSlug ?? companySlug ?? "your-company";

  const h = await headers();
  const host = h.get("host") ?? "pmrfp.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
  const profileUrl = `${base}/directory/${slug}`;

  return (
    <Container size="narrow" className="py-14">
      <Eyebrow>Free for listed companies</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Put your {SITE.name} badge on your website
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Free for every listed company. Add it to your website footer, your quotes and your email
        signature. A property manager who clicks it lands on your {SITE.name} profile — your
        trades, regions, insurance and projects — and your profile links straight back to your
        website.
      </p>
      <ul className="mt-5 space-y-2 text-sm text-foreground/90">
        <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-600" /> Shows buyers you&apos;re set up for commercial work before they call.</li>
        <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-600" /> Updates itself — the badge always reflects your current {SITE.name} status.</li>
        <li className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-600" /> Takes two minutes: copy the code below and paste it into your site.</li>
      </ul>

      {companySlug && linked && (
        <div className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm">
          This is the badge for <strong>{linked.name}</strong>. Copy the code below — it links to{" "}
          <Link href={`/directory/${companySlug}`} className="font-medium text-teal-700 hover:underline">
            your {SITE.name} profile
          </Link>
          . Want to edit that profile?{" "}
          <Link href="/sign-up" className="font-medium text-teal-700 hover:underline">
            Create your free account
          </Link>
          .
        </div>
      )}

      {!memberSlug && !companySlug && (
        <div className="mt-6 rounded-lg border border-dashed border-teal-300 bg-teal-50/60 p-4 text-sm">
          {session ? (
            <>Complete your company profile to generate your own badge. </>
          ) : (
            <>You&apos;re viewing a sample badge. </>
          )}
          <Link href="/sign-up" className="font-medium text-teal-700 hover:underline">
            Join {SITE.name}
          </Link>{" "}
          to get yours.
        </div>
      )}

      <div className="mt-10">
        <BadgeEmbed base={base} slug={slug} profileUrl={profileUrl} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">Want more than a badge?</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            The company card widget shows your trades, service area and a Request a quote button, right on your site.
          </p>
        </div>
        <Link
          href={companySlug ? `/widgets?w=company&company=${companySlug}` : "/widgets?w=company"}
          className={buttonVariants({ variant: "outline" })}
        >
          Get the card
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Where to paste it</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Tier icon={<Code2 className="size-5" />} title="WordPress" desc="Appearance → Widgets (or the Site Editor) → add a Custom HTML block to your footer → paste the website code." />
          <Tier icon={<Code2 className="size-5" />} title="Wix" desc="Add → Embed Code → Embed HTML → paste the website code, then drag it into your footer." />
          <Tier icon={<Code2 className="size-5" />} title="Squarespace" desc="Edit your footer → add a Code block → paste the website code." />
          <Tier icon={<Mail className="size-5" />} title="Email & quotes" desc="Paste the email-signature line into Gmail or Outlook signature settings, and at the bottom of your quote template." />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Someone else runs your website? Send them this page — the code works on any site.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Badge tiers</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your badge gets stronger as you complete your profile.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Tier icon={<Star className="size-5" />} title="Listed Vendor" desc="You have an approved profile in the PMRFP directory." />
          <Tier icon={<BadgeCheck className="size-5" />} title="Verified Vendor" desc="Company details reviewed by the PMRFP team. Buyers should still confirm licensing and insurance directly." />
          <Tier icon={<ShieldCheck className="size-5" />} title="+ Insured" desc="Insurance details listed on your profile (self-reported). Not shown on the badge image — buyers confirm coverage with you." />
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={memberSlug ? "/dashboard/company" : "/sign-up"} className={buttonVariants()}>
          {memberSlug ? "Update my profile" : "Get my badge"}
        </Link>
        <Link href={isSample ? "/directory" : `/directory/${slug}`} className={buttonVariants({ variant: "outline" })}>
          {isSample ? "Browse the directory" : "View profile"}
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
      <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">{icon}</span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
