import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { listVendors } from "@/lib/data/directory";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { isPastContract } from "@/lib/data/fomo";
import { getCategories } from "@/lib/data/taxonomy";
import { getMajorProjects } from "@/lib/major-projects/data";
import type { RfpListItem } from "@/lib/data/types";
import { buildAudience, type Audience, type CompanyItem } from "./audience";
import type { SponsorCountry } from "./model";

/** listVendors() reads at most this many rows; a full read means the count is a floor. */
const VENDOR_READ_CAP = 200;

/** Listed trade companies (trades + HQ province + countries only), cached hourly like the directory counts. */
const getCompanyRows = unstable_cache(
  async (): Promise<{ rows: CompanyItem[]; capped: boolean } | null> => {
    try {
      const v = await listVendors();
      return {
        rows: v.map((x) => ({ categories: x.categories, province: x.province, countries: x.countries })),
        capped: v.length >= VENDOR_READ_CAP,
      };
    } catch {
      return null;
    }
  },
  ["sponsor-audience-companies-v1"],
  { revalidate: 3600 },
);

/**
 * /advertise audience for one country, from the shared cached snapshots
 * (board, major projects, taxonomy) plus the hourly company list. No
 * full-table read per request.
 */
export const loadAudience = cache(async (country: SponsorCountry): Promise<{ audience: Audience; categories: { slug: string; name: string }[] }> => {
  const [rfps, categories, projects, companies] = await Promise.all([
    listAllRfpsCached().catch(() => [] as RfpListItem[]),
    getCategories().catch(() => []),
    country === "CA" ? getMajorProjects().catch(() => []) : Promise.resolve(null),
    getCompanyRows().catch(() => null),
  ]);
  const audience = buildAudience({
    country,
    board: rfps.map((r) => ({ slug: r.slug, categories: r.categories, province: r.province, status: r.status, award: isPastContract(r) })),
    categories,
    companies,
    projects: projects ? projects.map((p) => ({ province: p.province, tradesNeeded: p.tradesNeeded, stale: p.stale })) : null,
  });
  return { audience, categories: categories.map((c) => ({ slug: c.slug, name: c.name })) };
});
