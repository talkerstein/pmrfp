import Link from "@/i18n/link";
import type { ProfileStatus } from "@/types/db";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { SITE } from "@/lib/site";

/**
 * Where a company's listing stands, in one line at the top of the trade
 * dashboard: under review, turned down or suspended stay until that changes.
 * `welcome` (?welcome=1, right after onboarding) also confirms a listing
 * that's already live. A spam hold reads as an ordinary review.
 */
export function ListingStatusBanner({
  status,
  name,
  slug,
  welcome = false,
}: {
  status: ProfileStatus | null | undefined;
  name: string | null | undefined;
  slug: string | null | undefined;
  welcome?: boolean;
}) {
  const t = getT("dash").listingStatus;
  const company = name?.trim() || t.yourCompany;
  const title = (s: string) => fmt(s, { name: company });

  if (status === "approved") {
    if (!welcome) return null;
    return (
      <div role="status" className="mb-4 rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-900">
        <p className="font-semibold">{title(t.liveTitle)}</p>
        {slug && (
          <p className="mt-1">
            <Link href={`/directory/${slug}`} className="font-medium underline">{t.seePage}</Link>
          </p>
        )}
      </div>
    );
  }
  const body =
    status === "pending_review"
      ? { head: title(welcome ? t.reviewWelcomeTitle : t.reviewTitle), text: t.reviewBody }
      : status === "rejected"
        ? { head: title(t.rejectedTitle), text: fmt(t.rejectedBody, { email: SITE.email }) }
        : status === "suspended"
          ? { head: title(t.suspendedTitle), text: fmt(t.suspendedBody, { email: SITE.email }) }
          : null;
  if (!body) return null;
  return (
    <div role="status" className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">{body.head}</p>
      <p className="mt-1">{body.text}</p>
    </div>
  );
}
