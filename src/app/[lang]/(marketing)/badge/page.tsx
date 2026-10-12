import type { Metadata } from "next";
import Link from "@/i18n/link";
import { headers } from "next/headers";
import { BadgeCheck, Code2, Mail, ShieldCheck, Star } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { BadgeEmbed } from "@/components/public/badge-embed";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/access/access";
import { getBadgeInfo } from "@/lib/badge/data";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).partners.badge.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/badge") };
}

export default async function BadgePage({
  searchParams, params }: {
  searchParams: Promise<{ company?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("partners").badge;
  const site = { site: SITE.name };
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
  // French and Spanish code link to the profile in that language; English is unchanged.
  const profileUrl = `${base}${localizePath(`/directory/${slug}`, lang)}`;

  return (
    <Container size="narrow" className="py-14">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        {fmt(t.title, site)}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        {fmt(t.body, site)}
      </p>
      <ul className="mt-5 space-y-2 text-sm text-foreground/90">
        {t.bullets.map((b) => (
          <li key={b} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-teal-600" /> {fmt(b, site)}</li>
        ))}
      </ul>

      {companySlug && linked && (
        <div className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm">
          {t.linked.before}<strong>{linked.name}</strong>{t.linked.mid}
          <Link href={`/directory/${companySlug}`} className="font-medium text-teal-700 hover:underline">
            {fmt(t.linked.profile, site)}
          </Link>
          {t.linked.edit}
          <Link href="/sign-up" className="font-medium text-teal-700 hover:underline">
            {t.linked.create}
          </Link>
          {t.linked.end}
        </div>
      )}

      {!memberSlug && !companySlug && (
        <div className="mt-6 rounded-lg border border-dashed border-teal-300 bg-teal-50/60 p-4 text-sm">
          {session ? t.sample.incomplete : t.sample.viewing}
          <Link href="/sign-up" className="font-medium text-teal-700 hover:underline">
            {fmt(t.sample.join, site)}
          </Link>
          {t.sample.after}
        </div>
      )}

      <div className="mt-10">
        <BadgeEmbed base={base} slug={slug} profileUrl={profileUrl} />
      </div>

      {!isSample && (
        <p className="mt-6 text-sm">
          <Link href={`/badges/company/${slug}`} className="font-medium text-teal-700 hover:underline">
            {fmt(getT("growth").badges.kit, { name: linked?.name ?? session?.organization?.name ?? "" })} →
          </Link>
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">{t.more.title}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t.more.body}
          </p>
        </div>
        <Link
          href={companySlug ? `/widgets?w=company&company=${companySlug}` : "/widgets?w=company"}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.more.cta}
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.whereTitle}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {t.where.map((w, i) => (
            <Tier key={w.title} icon={i === 3 ? <Mail className="size-5" /> : <Code2 className="size-5" />} title={w.title} desc={w.desc} />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t.whereNote}
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">{t.tiersTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.tiersNote}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {t.tiers.map((tier, i) => (
            <Tier key={tier.title} icon={TIER_ICONS[i]} title={tier.title} desc={tier.desc} />
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={memberSlug ? "/dashboard/company" : "/sign-up"} className={buttonVariants()}>
          {memberSlug ? t.update : t.get}
        </Link>
        <Link href={isSample ? "/directory" : `/directory/${slug}`} className={buttonVariants({ variant: "outline" })}>
          {isSample ? t.browse : t.view}
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        {fmt(t.disclaimer, site)}
      </p>
    </Container>
  );
}

const TIER_ICONS = [<Star key="listed" className="size-5" />, <BadgeCheck key="verified" className="size-5" />, <ShieldCheck key="insured" className="size-5" />];

function Tier({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-teal-600">{icon}</span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
