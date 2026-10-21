import { RecordFooter } from "@/components/public/record-footer";
import { SH2, SimplePage } from "@/components/v3/simple";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { BUYERS_PATH, type BuyerPage } from "@/lib/buyers/model";
import type { BuyerPermission } from "@/lib/buyers/permissions";
import type { RfpListItem } from "@/lib/data/types";
import { publicTenderSource } from "@/lib/tenders/sources";
import { TOWN_SOURCE, townType } from "@/lib/towns/data";
import type { ManagedPage } from "@/lib/towns/managed";
import { buyerKey } from "@/lib/towns/managed";
import { inSentence } from "@/lib/towns/names";
import { getLang, getT } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { FollowBlock } from "@/components/follows/blocks";
import { provincePath } from "@/lib/buyers/province";
import { AwardsAndProjects, ClaimCta, ManagedRows, NearbyBids, OpenBidList, TownWidgetCode, UpcomingPurchases, VerifiedBadge, awardsAndProjectsCount } from "./blocks";

/**
 * A municipality's page when only Statistics Canada knows it (no directory
 * research yet): its census facts, where it posts bids (once known), its
 * open bids on PMRFP, the claim and follow calls to action, nearby bids and,
 * once managed, what the verified buyer added. Indexing is decided by the
 * route (lib/buyers/model isIndexablePage).
 */
export function TownPageView({
  page: p,
  name,
  place,
  managed,
  permission,
  nearby,
  regionSlug,
}: {
  page: BuyerPage;
  /** "Town of Cobourg" / "Ville de Cobourg". */
  name: string;
  /** "Cobourg". */
  place: string;
  managed: ManagedPage | null;
  permission: BuyerPermission | null;
  nearby: readonly RfpListItem[];
  regionSlug: string | null;
}) {
  const lang = getLang();
  const t = getT("towns").page;
  const tb = getT("buyers");
  const home = getT("v3Pages").simple.home;
  const L = (path: string) => localizePath(path, lang);
  const town = p.town!;
  const province = regionName(p.province, lang);
  const type = townType(town, lang);
  const key = buyerKey(p.provinceSlug, p.buyer.slug);
  const listed = permission?.status === "yes";
  const declined = permission?.status === "no";
  const credits = new Set<string>([TOWN_SOURCE.attribution]);
  for (const o of p.openBids) credits.add(publicTenderSource(o.slug).attribution);
  for (const r of nearby) credits.add(publicTenderSource(r.slug).attribution);
  const hasLinks = Boolean(managed && (managed.bidsUrl || managed.platformUrl || managed.vendorRegistrationUrl || managed.contactEmail || managed.contactPhone));
  for (const a of p.awards.recent) credits.add(publicTenderSource(a.slug).attribution);
  // Section numbers, in page order (a section that isn't shown takes no number).
  let n = 0;
  const no = {
    where: ++n,
    open: ++n,
    upcoming: managed?.upcoming.length ? ++n : 0,
    awards: n + 1,
    nearby: (n += awardsAndProjectsCount(p)) + 1,
    widget: 0,
    sources: 0,
  };
  n = no.nearby;
  if (managed) no.widget = ++n;
  no.sources = ++n;

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: home, path: L("/") },
          { name: tb.page.crumb, path: L(BUYERS_PATH) },
          { name: province, path: L(provincePath(p.provinceSlug)) },
          { name, path: L(p.path) },
        ])}
      />
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={[{ label: tb.page.crumb, href: BUYERS_PATH }, { label: province, href: provincePath(p.provinceSlug) }]}
        tabs={false}
        aside={false}
        title={name}
        lead={town.population != null ? fmt(t.leadPopulation, { type, province, n: formatNumber(town.population, lang) }) : fmt(t.lead, { type, province })}
      >
        <div className="s-facts">
          <div><div className="k">{t.facts.type}</div><div className="v" data-stat="type">{type}</div></div>
          <div><div className="k">{t.facts.population}</div><div className="v" data-stat="population">{town.population != null ? formatNumber(town.population, lang) : "—"}</div></div>
          <div><div className="k">{t.facts.open}</div><div className="v" data-stat="open">{formatNumber(p.openBids.length, lang)}</div></div>
        </div>

        {managed && <div style={{ marginTop: 18 }}><VerifiedBadge managed={managed} name={managed.organizationName || name} /></div>}

        <SH2 no={no.where} id="where">{fmt(t.whereTitle, { name: inSentence(name, lang) })}</SH2>
        {hasLinks ? (
          <>
            <div className="s-dtw">
              <table className="s-dt" data-list="where">
                <tbody><ManagedRows managed={managed!} /></tbody>
              </table>
            </div>
            <p className="small muted">{t.officialNote}</p>
          </>
        ) : (
          <>
            <p data-where="unknown">{t.whereUnknown}</p>
            {!managed && !declined && <p className="small muted">{t.whereUnknownHint}</p>}
          </>
        )}
        {listed && (
          <div className="s-callout" data-permission="yes">
            <p>
              <b>{fmt(tb.page.permission.listed, { name })}</b>
              {permission?.grantedOn ? ` (${fmt(tb.page.permission.since, { date: formatDate(`${permission.grantedOn}T12:00:00Z`, lang) })})` : ""}
            </p>
          </div>
        )}

        <OpenBidList bids={p.openBids} name={inSentence(name, lang)} no={no.open} />
        {managed && no.upcoming > 0 && <UpcomingPurchases managed={managed} no={no.upcoming} />}
        <AwardsAndProjects p={p} name={name} no={no.awards} />

        {!managed && !declined && <ClaimCta name={name} buyerKey={key} />}
        <FollowBlock page={p} name={inSentence(name, lang)} title={fmt(t.followTitle, { place })} regionSlug={regionSlug} kind="town" />

        <NearbyBids rows={nearby} place={place} province={province} provinceSlug={p.provinceSlug} no={no.nearby} />

        {managed && (
          <>
            <SH2 no={no.widget} id="widget">{t.widgetTitle}</SH2>
            <TownWidgetCode provinceSlug={p.provinceSlug} slug={p.buyer.slug} lang={lang} title={t.widgetTitle} body={t.widgetBody} />
          </>
        )}

        <SH2 no={no.sources} id="sources">{t.sourcesTitle}</SH2>
        <p className="small muted">{fmt(t.sourceCensus, { census: TOWN_SOURCE.census })}</p>
        <RecordFooter credits={credits} lang={lang} kind="other" path={p.path} refId={key} />

        <div className="s-links">
          <a href={L(BUYERS_PATH)}>{t.back} →</a>
          <a href={L(provincePath(p.provinceSlug))}>{province} →</a>
        </div>
      </SimplePage>
    </>
  );
}
