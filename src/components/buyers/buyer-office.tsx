import type { BuyerPage } from "@/lib/buyers/model";
import { buyerOffice, contactAccess, type BuyerOffice } from "@/lib/buyers/office";
import { buyerPageExtras } from "@/lib/towns/page-data";
import type { Messages } from "@/i18n/dictionaries";
import { getT } from "@/i18n/server";

type T = Messages["listDepth"]["office"];

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const telHref = (p: string) => `tel:${p.replace(/[^0-9+]/g, "")}`;

/**
 * A public buyer's general office details on its tenders: website, bids page,
 * procurement inbox and phone, whichever PMRFP holds (lib/buyers/office). Free
 * for everyone. It is handed organization-level data only, so there is no way
 * for the named contact on a notice to reach it; `proNote` adds the line that
 * says that contact and the bid checklist are in Trade Pro.
 */
export function BuyerOfficeCard({ name, office, t, proNote }: { name: string; office: BuyerOffice; t: T; proNote: boolean }) {
  const rows: { key: string; label: string; value: React.ReactNode }[] = [];
  if (office.website) rows.push({ key: "website", label: t.website, value: <a className="ext" href={office.website} target="_blank" rel="noopener noreferrer nofollow">{host(office.website)}</a> });
  if (office.bidsPage) rows.push({ key: "bids", label: t.bids, value: <a className="ext" href={office.bidsPage} target="_blank" rel="noopener noreferrer nofollow">{host(office.bidsPage)}</a> });
  if (office.procurementEmail) rows.push({ key: "email", label: t.email, value: <a href={`mailto:${office.procurementEmail}`}>{office.procurementEmail}</a> });
  if (office.phone) rows.push({ key: "phone", label: t.phone, value: <a href={telHref(office.phone)}>{office.phone}</a> });
  if (!rows.length) return null;
  return (
    <section className="vp-block" data-block="buyer-office">
      <h2>{t.title}</h2>
      <p><b>{name}</b> · {t.free}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <li key={r.key} data-office={r.key}>
            <b>{r.label}:</b> {r.value}
          </li>
        ))}
      </ul>
      <p className="vp-attr">
        {t.source}
        {proNote ? ` ${t.proNote}` : ""}
      </p>
    </section>
  );
}

/**
 * The card for a tender page: looks up the buyer's page extras (shared
 * snapshots, no query of its own) and renders nothing when no office details
 * are held. Mounted outside the Trade Pro view on purpose.
 */
export async function BuyerOfficeBlock({ page, pro }: { page: BuyerPage; pro: boolean }) {
  const { managed } = await buyerPageExtras(page).catch(() => ({ managed: null }));
  const office = buyerOffice(page.buyer, managed);
  if (!office) return null;
  const access = contactAccess({ pro });
  return <BuyerOfficeCard name={page.buyer.name} office={office} t={getT("listDepth").office} proNote={!access.namedContact} />;
}
