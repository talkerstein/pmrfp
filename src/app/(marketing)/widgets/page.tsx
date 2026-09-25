import type { Metadata } from "next";
import Link from "next/link";
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

export const metadata: Metadata = {
  title: "Free Website Widgets for Trades, Property Managers & Realtors",
  description:
    "Put live PMRFP content on your own website: a tender feed for your trade and region, your open bids, your jobs, your company card or your trusted trades. Copy, paste, done. Free.",
  alternates: { canonical: "/widgets" },
};

const POSTERS = new Set(["property_manager", "owner", "builder"]);
const LISTED = new Set(["trade_company", "supplier"]);

export default async function WidgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; company?: string }>;
}) {
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
          <Eyebrow>Free website widgets</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Put {SITE.name} on your own website
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Live tenders, your open bids, your jobs, your company card or your trusted trades, updated automatically.
            Pick one, copy two lines of code, paste. Works on WordPress, Wix, Squarespace, Webflow and hand-built sites.
          </p>
          <ul className="mt-6 grid max-w-3xl gap-3 text-sm sm:grid-cols-2">
            <Point icon={<RefreshCw className="size-4" />} text="Always current. Nothing to update by hand." />
            <Point icon={<Gauge className="size-4" />} text="Loads after your page, so it never slows your site." />
            <Point icon={<ShieldCheck className="size-4" />} text="Read-only. No cookies, no tracking of your visitors." />
            <Point icon={<Code2 className="size-4" />} text="Resizes itself to fit. Light and dark styles." />
          </ul>
        </Container>
      </section>

      <Container className="py-12">
        <WidgetBuilder
          base={base}
          initialKind={initialKind}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          regions={regions.map((r) => ({ slug: r.slug, name: r.province ? `${r.name}, ${r.province}` : r.name }))}
          access={access}
        />

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Where to paste it</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Where title="WordPress" desc="Edit the page, add a Custom HTML block where you want the widget, paste the code, update." />
            <Where title="Wix" desc="Add → Embed Code → Embed HTML, choose Code, paste. Drag the box to size it." />
            <Where title="Squarespace" desc="Edit the page, add a Code block, paste the code, save." />
            <Where title="Webflow & others" desc="Add an Embed (or HTML) element and paste. Any site that accepts HTML works." />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Someone else runs your website? Send them this page. Want the simple version?{" "}
            <Link href="/badge" className="font-medium text-teal-700 hover:underline">
              Get the {SITE.name} badge
            </Link>
            .
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
