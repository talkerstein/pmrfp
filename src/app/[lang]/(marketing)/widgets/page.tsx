import type { Metadata } from "next";
import Link from "@/i18n/link";
import { headers } from "next/headers";
import { Code2, Gauge, RefreshCw, ShieldCheck } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { WidgetBuilder, type WidgetAccess } from "@/components/embed/widget-builder";
import { getSession } from "@/lib/access/access";
import { getBadgeInfo } from "@/lib/badge/data";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { bidsWidgetKey } from "@/lib/embed/keys";
import { WIDGET_KINDS, type WidgetKind } from "@/lib/embed/widgets";
import { getMyTrustedList } from "@/lib/trusted/data";
import { TRUSTED_ROLES } from "@/lib/trusted/rules";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).partners.widgets.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/widgets") };
}

const POSTERS = new Set(["property_manager", "owner", "builder", "landlord"]);
const LISTED = new Set(["trade_company", "supplier"]);

export default async function WidgetsPage({
  searchParams, params }: {
  searchParams: Promise<{ w?: string; company?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("partners").widgets;
  const [session, sp, categories, regions] = await Promise.all([getSession(), searchParams, getCategories(), getRegions()]);
  const org = session?.organization ?? null;
  const role = session?.profile.primary_role ?? null;

  // ?company=<slug>: the link in badge emails, so a listed company can grab its
  // card without an account (same rule as /badge: approved listings only).
  const linked = !(org && LISTED.has(org.organization_type)) && sp.company ? await getBadgeInfo(sp.company) : null;
  const trusted =
    session && role && (TRUSTED_ROLES as readonly string[]).includes(role) ? await getMyTrustedList(session.userId) : null;
  const bidsKey = org && POSTERS.has(org.organization_type) ? bidsWidgetKey(org.id) : null;

  const access: WidgetAccess = {
    signedIn: !!session,
    bids: org && bidsKey ? { slug: org.slug, key: bidsKey } : null,
    jobs: org ? { slug: org.slug } : null,
    company:
      org && LISTED.has(org.organization_type)
        ? { slug: org.slug, ready: org.profile_status === "approved" }
        : linked?.found
          ? { slug: linked.slug, ready: true }
          : null,
    trusted: trusted?.list?.published ? { handle: trusted.list.handle } : null,
  };

  // Open on the tab the member can actually use, unless a link asked for one.
  const asked = WIDGET_KINDS.find((k) => k === sp.w);
  const initialKind: WidgetKind =
    asked ??
    (access.company ? "company" : access.bids ? "bids" : access.trusted ? "trusted" : "feed");

  // Code copied on production always points at pmrfp.com; previews and local
  // dev point at themselves so the widgets can be tried before release.
  const h = await headers();
  const host = h.get("host") ?? "pmrfp.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = process.env.VERCEL_ENV === "production" ? SITE.url : `${proto}://${host}`;

  return (
    <>
      <section className="border-b border-border bg-card">
        <Container className="py-14">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            {fmt(t.title, { site: SITE.name })}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t.body}
          </p>
          <ul className="mt-6 grid max-w-3xl gap-3 text-sm sm:grid-cols-2">
            <Point icon={<RefreshCw className="size-4" />} text={t.points[0]} />
            <Point icon={<Gauge className="size-4" />} text={t.points[1]} />
            <Point icon={<ShieldCheck className="size-4" />} text={t.points[2]} />
            <Point icon={<Code2 className="size-4" />} text={t.points[3]} />
          </ul>
        </Container>
      </section>

      <Container className="py-12">
        <WidgetBuilder
          base={base}
          initialKind={initialKind}
          categories={categories.map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }))}
          regions={regions.map((r) => {
            const name = regionName(r.name, lang);
            return { slug: r.slug, name: r.province ? `${name}, ${regionName(r.province, lang)}` : name };
          })}
          access={access}
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">{t.whereTitle}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.where.map((w) => (
              <Where key={w.title} title={w.title} desc={w.desc} />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t.footBefore}{" "}
            <Link href="/badge" className="font-medium text-teal-700 hover:underline">
              {fmt(t.footLink, { site: SITE.name })}
            </Link>
            {t.footAfter}
          </p>
        </section>
      </Container>
    </>
  );
}

function Point({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">{icon}</span>
      {text}
    </li>
  );
}

function Where({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
