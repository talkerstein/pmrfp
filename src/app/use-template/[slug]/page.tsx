/**
 * "Use this template" entry-point. One URL that does the right thing for ANY user:
 *
 * - Authed property manager: redirect straight to /pm-dashboard/rfps/new?template=X (form pre-fills).
 * - Authed other role (trade/supplier/visitor): redirect to /pm-dashboard/rfps/new which will trigger
 *   the existing requireRole redirect to roleHome — they see the right surface for them.
 * - Anonymous: redirect to /sign-up?role=property_manager&next={the new-RFP url}. The signup flow
 *   carries `next` through onboarding so the slug isn't lost.
 *
 * Lives at /use-template instead of /rfp-templates/.../use because it's not a content page —
 * it's a router. Keeping it outside (marketing) avoids accidental sitemap inclusion.
 */
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { getRfpTemplate } from "@/lib/seo/rfp-templates";
import { EVENT, trackEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function UseTemplateRouter({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = getRfpTemplate(slug);
  if (!template) notFound();

  const destination = `/pm-dashboard/rfps/new?template=${template.slug}`;
  const session = await getSession();

  await trackEvent(EVENT.TEMPLATE_USED, {
    template: template.slug,
    trade: template.tradeSlug,
    authed: !!session,
  });

  if (!session) {
    // Anonymous: send to signup with role pre-picked + next path preserved.
    redirect(
      `/sign-up?role=property_manager&next=${encodeURIComponent(destination)}`,
    );
  }

  // Authed: go straight to destination. requireRole on /pm-dashboard/rfps/new
  // will redirect non-PM roles to their own home automatically.
  redirect(destination);
}
