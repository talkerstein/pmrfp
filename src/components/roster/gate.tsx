import type { ReactNode } from "react";
import Link from "@/i18n/link";
import { DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { requireRole, isDemoMode, type SessionContext } from "@/lib/access/access";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { rosterCountry } from "@/lib/roster/server";
import type { RosterCountry } from "@/lib/roster/rules";
import type { Messages } from "@/i18n/dictionaries";

type Dash = Messages["roster"]["dash"];

/** The signed-in PM and their company's country (the roster's wording and directory scope). */
export async function rosterPm(): Promise<{ session: SessionContext; country: RosterCountry }> {
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const geo = await getAccountGeo(session).catch(() => null);
  return { session, country: rosterCountry(geo?.country, session.organization) };
}

/**
 * What a roster page shows instead of the roster: demo mode, no company
 * yet, or the migration not applied. Null: go ahead.
 */
export function rosterBlocked(x: { session: SessionContext; header: ReactNode; t: Dash; ready?: boolean }): ReactNode | null {
  if (isDemoMode()) {
    return (
      <div>
        <DemoBanner />
        {x.header}
        <EmptyState title={x.t.notReadyTitle} description={x.t.demoBody} />
      </div>
    );
  }
  if (!x.session.organization) {
    return (
      <div>
        {x.header}
        <EmptyState title={x.t.noOrgTitle} description={x.t.noOrgBody}>
          <Link href="/onboarding" className={buttonVariants()}>{x.t.noOrgCta}</Link>
        </EmptyState>
      </div>
    );
  }
  if (x.ready === false) {
    return (
      <div>
        {x.header}
        <EmptyState title={x.t.notReadyTitle} description={x.t.notReadyBody} />
      </div>
    );
  }
  return null;
}
