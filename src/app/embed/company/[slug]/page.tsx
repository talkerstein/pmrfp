import { BadgeCheck, MapPin, Users } from "lucide-react";
import { WidgetLogo, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { getVendor } from "@/lib/data/directory";
import { getRecommendedBy } from "@/lib/trusted/data";
import { outLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

function more(items: string[], n: number): string {
  return items.length > n ? `${items.slice(0, n).join(", ")} +${items.length - n}` : items.join(", ");
}

/** A trade's or supplier's PMRFP card, for its own website. */
export default async function CompanyWidget({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await getVendor(slug);
  if (!vendor) return <WidgetUnavailable href={outLink(SITE.url, "/directory", "company")} />;
  const recommenders = await getRecommendedBy(vendor.id);
  const profile = outLink(SITE.url, `/directory/${vendor.slug}`, "company");
  const place = [vendor.city, vendor.province].filter(Boolean).join(", ");

  return (
    <WidgetShell
      kind="company"
      list={false}
      media={<WidgetLogo src={vendor.logoUrl} name={vendor.name} />}
      eyebrow={vendor.verified ? "Verified on PMRFP" : "Listed on PMRFP"}
      title={vendor.name}
      subtitle={place || null}
      footerLinks={[
        { href: profile, label: "See our profile" },
        { href: outLink(SITE.url, "/directory", "company"), label: "Commercial trade directory" },
      ]}
    >
      <div className="space-y-3 px-4 py-3">
        {vendor.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vendor.categories.slice(0, 4).map((c) => (
              <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {vendor.regions.length > 0 && (
            <li className="flex items-start gap-1.5">
              <MapPin className="mt-px size-3.5 shrink-0" /> Serves {more(vendor.regions, 3)}
            </li>
          )}
          {vendor.verified && (
            <li className="flex items-start gap-1.5">
              <BadgeCheck className="mt-px size-3.5 shrink-0 text-accent-foreground" /> Company details reviewed by PMRFP
              {vendor.yearsInBusiness ? ` · ${vendor.yearsInBusiness} years in business` : ""}
            </li>
          )}
          {recommenders.length > 0 && (
            <li className="flex items-start gap-1.5">
              <Users className="mt-px size-3.5 shrink-0" /> Recommended by {recommenders.length} local{" "}
              {recommenders.length === 1 ? "professional" : "professionals"}
            </li>
          )}
        </ul>
        <a
          href={profile}
          suppressHydrationWarning
          target="_blank"
          rel="noopener"
          className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Request a quote
        </a>
      </div>
    </WidgetShell>
  );
}
