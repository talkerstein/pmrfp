import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "@/i18n/link";
import { ArrowLeft, Download, Link2, Printer, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { RosterEditor, type RowView, type SlotView } from "@/components/roster/editor";
import { rosterBlocked, rosterPm } from "@/components/roster/gate";
import { getCategories } from "@/lib/data/taxonomy";
import { invitedEmails, linkedOrgs, loadInsuranceCerts, loadRoster } from "@/lib/roster/server";
import { buildingGaps, insuranceFor, linkIsLive, provincesFor, rosterRows, telHref, type CertLite, type VendorSlot } from "@/lib/roster/rules";
import { findWhoFor, placeOf, rfpTradeFor, rowLabel } from "@/lib/roster/view";
import { cleanEmail } from "@/lib/vendor-certs/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.dash.metaTitle, robots: { index: false, follow: false } };
}

/**
 * /pm-dashboard/roster/<id> — one building's roster: the trade rows with
 * their gap chips (and the PM's own insurance tracker status per vendor),
 * filling gaps from PMRFP, the building's basics and the share links.
 */
export default async function RosterEditPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await setLangFrom(params);
  const R = getT("roster");
  const { id } = await params;
  const { session, country } = await rosterPm();
  const blocked = rosterBlocked({ session, header: <PageHeader title={R.dash.title} />, t: R.dash });
  if (blocked || !session.organization) return blocked;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createClient();
  const { ready, roster, entries, links } = await loadRoster(db, id);
  const notReady = rosterBlocked({ session, header: <PageHeader title={R.dash.title} />, t: R.dash, ready });
  if (notReady) return notReady;
  if (!roster) notFound();

  const rows = rosterRows(entries, { country, province: roster.province });
  const [certs, linked, invited, categories] = await Promise.all([
    loadInsuranceCerts(db, session.organization.id),
    linkedOrgs(db, entries.flatMap((e) => [e.primary_org_id, e.backup_org_id])),
    invitedEmails(db, session.organization.id),
    getCategories().catch(() => []),
  ]);
  const tradeNames = new Map(categories.map((c) => [c.slug, c.name]));

  const slotView = (s: VendorSlot | null, all: readonly CertLite[]): SlotView | null =>
    s
      ? {
          name: s.name,
          phone: s.phone,
          email: s.email,
          tel: telHref(s.phone),
          insurance: insuranceFor(s, all),
          profile: s.orgId ? (linked.get(s.orgId) ?? null) : null,
          invited: Boolean(cleanEmail(s.email) && invited.has(cleanEmail(s.email)!)),
        }
      : null;

  const views: RowView[] = rows.map((r) => {
    const label = rowLabel(r, R, country);
    return {
      key: r.key,
      entryId: r.entryId,
      category: r.category,
      label,
      customLabel: r.customLabel,
      tradeSlug: r.tradeSlug,
      notNeeded: r.notNeeded,
      available247: r.available247,
      notes: r.notes,
      gaps: r.gaps,
      primary: slotView(r.primary, certs),
      backup: slotView(r.backup, certs),
      findWho: findWhoFor(r, R, label),
      rfpTrade: rfpTradeFor(r, R, tradeNames),
    };
  });

  const e = R.editor;
  const base = `/pm-dashboard/roster/${roster.id}`;
  const where = [roster.address, roster.city, roster.province].filter(Boolean).join(", ");

  return (
    <div>
      <Link href="/pm-dashboard/roster" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {e.back}
      </Link>
      <PageHeader
        title={roster.building_name}
        description={where || undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/card`} className={buttonVariants({ size: "sm" })}>
              <Siren className="size-3.5" /> {e.actions.card}
            </Link>
            <Link href={`${base}/print`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Printer className="size-3.5" /> {e.actions.print}
            </Link>
            <a href={`/api/roster/vcard?id=${roster.id}&lang=${lang}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Download className="size-3.5" /> {e.actions.vcard}
            </a>
            <a href="#share" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <Link2 className="size-3.5" /> {e.actions.share}
            </a>
          </div>
        }
      />
      <RosterEditor
        roster={roster}
        rows={views}
        links={links.filter(linkIsLive).map((l) => ({ id: l.id, token: l.token, label: l.label, createdAt: l.created_at, viewCount: l.view_count, lastViewedAt: l.last_viewed_at }))}
        country={country}
        provinces={[...provincesFor(country)]}
        trades={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        place={placeOf(roster)}
        buildingGapList={buildingGaps(roster)}
        copy={{ editor: R.editor, gaps: R.gaps, insurance: R.insurance, buildingGaps: R.buildingGaps, rfp: R.rfp[country] }}
      />
    </div>
  );
}
