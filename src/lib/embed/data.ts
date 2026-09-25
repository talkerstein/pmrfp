import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { displayTitle } from "@/lib/tenders/title";

/** Organizations that post RFPs (the "bids" widget). Trades don't post. */
const POSTER_TYPES = ["property_manager", "owner", "builder"];

export interface EmbedOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  type: string;
}

/** An active (not suspended) organization by its public slug. */
export async function getActiveOrg(slug: string): Promise<EmbedOrg | null> {
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
  const supabase = createServiceClient();

  const today = new Date().toISOString().slice(0, 10);
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
