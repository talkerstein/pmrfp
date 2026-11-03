import { unstable_cache } from "next/cache";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PUBLIC_DATA_TAG, PUBLIC_DATA_TTL } from "@/lib/supabase/public-cache";

// Storage lists are POSTs: cache their public result, not arbitrary storage requests.
const cachedPortfolioPhotos = unstable_cache(
  async (orgId: string, projectUrl: string): Promise<string[]> => {
    const { data, error } = await createReadClient().storage.from("logos").list(orgId, {
      limit: 100,
      search: "portfolio-",
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw error;
    return (data ?? [])
      .filter((object) => object.name.startsWith("portfolio-"))
      .map((object) => `${projectUrl}/storage/v1/object/public/logos/${orgId}/${object.name}`);
  },
  ["public-portfolio-photos-v1"],
  { tags: [PUBLIC_DATA_TAG], revalidate: PUBLIC_DATA_TTL },
);

export async function getPortfolioPhotos(orgId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await cachedPortfolioPhotos(orgId, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    // Keep profiles available, but do not persist transient failures as empty portfolios.
    return [];
  }
}
