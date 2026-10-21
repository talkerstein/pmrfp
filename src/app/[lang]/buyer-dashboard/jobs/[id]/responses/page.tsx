/**
 * A town handles the responses to its quote request with the PM job flow's
 * own page (shortlist, decline, pick, share my contact), shown inside the
 * public-buyer dashboard. Same component, same checks: the page reads the
 * responses as the signed-in member (row level security) and accepts the
 * public_buyer role.
 */
export { default, generateMetadata } from "@/app/[lang]/pm-dashboard/rfps/[id]/interests/page";
