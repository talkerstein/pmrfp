import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { displayTitle } from "@/lib/tenders/title";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { UUID } from "@/lib/d1/contracts";
import { publicAssetId } from "@/lib/d1/public-asset-preview";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

/** Organizations that post RFPs (the "bids" widget). Trades don't post. */
const POSTER_TYPES = ["property_manager", "owner", "builder", "landlord"];

export interface EmbedOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  type: string;
}

/** An active (not suspended) organization by its public slug. */
export async function getActiveOrg(slug: string): Promise<EmbedOrg | null> {
  if (isVpsLiveCustomerAuth()) {
    const row = await vpsAppDatabase().prepare(`SELECT id,name,slug,logo_url AS logoUrl,organization_type AS type FROM organizations
      WHERE slug=? AND status='active' AND is_demo=0 AND ${customerAppAuthority}`).bind(slug).first<EmbedOrg>();
    if (!row) return null;
    const media = /^\/api\/company-media\/([^/]+)$/.exec(row.logoUrl ?? "");
    if (media && UUID.test(media[1])) return row;
    const id = row.logoUrl ? publicAssetId(row.logoUrl) : null;
    return { ...row, logoUrl: id ? `/api/migration/public-asset/${id}` : null };
  }
  if (!isSupabaseConfigured() || !isServiceConfigured()) return null;
  const { data: org } = await createServiceClient()
    .from("organizations")
    .select("id,name,slug,logo_url,organization_type,status")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string; slug: string; logo_url: string | null; organization_type: string; status: string }>();
  if (!org || org.status !== "active") return null;
  return { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logo_url, type: org.organization_type };
}

export interface EmbedBid {
  slug: string;
  title: string;
  reference: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  categories: string[];
}

interface BidRow {
  slug: string;
  title: string;
  city: string | null;
  province: string | null;
  deadline: string | null;
  source_type: string | null;
  rfp_categories: { trade_categories: { name: string } | null }[] | null;
}

/**
 * A poster's open bids for its own website. Only RFPs posted with public
 * contact details are listed: those already name the poster on the RFP page,
 * so the widget can't be used to unmask an RFP posted anonymously or through
 * PMRFP (the widget URL is just the org's public slug).
 */
export async function getOrgBids(slug: string): Promise<{ org: EmbedOrg; bids: EmbedBid[] } | null> {
  const org = await getActiveOrg(slug);
  if (!org || !POSTER_TYPES.includes(org.type)) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (isVpsLiveCustomerAuth()) {
    const { results } = await vpsAppDatabase().prepare(`SELECT r.slug,r.title,r.city,r.province,r.deadline,r.source_type,
      (SELECT json_group_array(t.name) FROM rfp_categories c JOIN trade_categories t ON t.id=c.category_id
        WHERE c.rfp_id=r.id) AS categoryNames FROM rfp_posts r
      WHERE r.posted_by_organization_id=? AND r.status='published' AND r.contact_visibility='public_contact'
        AND r.is_demo=0 AND r.source_type<>'public_source' AND (r.deadline IS NULL OR r.deadline>=?)
        AND ${customerAppAuthority} ORDER BY r.deadline IS NULL,r.deadline,r.id LIMIT 20`)
      .bind(org.id, today).all<Omit<BidRow, "rfp_categories"> & { categoryNames: string }>();
    return { org, bids: results.map((row) => {
      const { title, reference } = displayTitle(row.title, row.source_type);
      return { slug: row.slug, title, reference: reference ?? null, city: row.city, province: row.province,
        deadline: row.deadline, categories: JSON.parse(row.categoryNames) as string[] };
    }) };
  }
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("rfp_posts")
    .select("slug,title,city,province,deadline,source_type,rfp_categories(trade_categories(name))")
    .eq("posted_by_organization_id", org.id)
    .eq("status", "published")
    .eq("contact_visibility", "public_contact")
    .eq("is_demo", false)
    .neq("source_type", "public_source")
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(20);

  const bids = ((data as unknown as BidRow[] | null) ?? []).map((r) => {
    const { title, reference } = displayTitle(r.title, r.source_type);
    return {
      slug: r.slug,
      title,
      reference: reference ?? null,
      city: r.city,
      province: r.province,
      deadline: r.deadline,
      categories: (r.rfp_categories ?? []).flatMap((c) => (c.trade_categories?.name ? [c.trade_categories.name] : [])),
    };
  });
  return { org, bids };
}
