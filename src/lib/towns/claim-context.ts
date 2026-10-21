import { cache } from "react";
import { loadBuyers } from "@/lib/buyers/load";
import type { BuyerPage } from "@/lib/buyers/model";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { holdersOf, trustedByKey } from "./claimable";
import { domainOwners } from "./domains";

export interface ClaimContext {
  pages: BuyerPage[];
  /** Admin-trusted domains by buyer key (buyer_domains). */
  trusted: Map<string, string[]>;
  /** Domain → buyer identities that own it. */
  owners: Map<string, Set<string>>;
}

/**
 * Everything a claim decision needs: every buyer page (the shared snapshots,
 * lib/buyers/load) and the admin-trusted domains (one small service read,
 * only on the claim step and the admin screen, never on public pages).
 */
export const claimContext = cache(async (): Promise<ClaimContext> => {
  const { pages } = await loadBuyers();
  let rows: { buyer_key: string; domain: string }[] = [];
  if (isServiceConfigured()) {
    const { data, error } = await createServiceClient().from("buyer_domains").select("buyer_key,domain").limit(5000);
    if (!error) rows = (data ?? []) as { buyer_key: string; domain: string }[];
  }
  const trusted = trustedByKey(rows);
  return { pages, trusted, owners: domainOwners(holdersOf(pages, trusted)) };
});
