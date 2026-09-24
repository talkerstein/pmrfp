import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { gcFormPath, parseAwardRef } from "@/lib/gc/packages";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Post a sub-trade package",
  robots: { index: false, follow: true },
};

/**
 * One link for every "post your sub-trade packages" button (award pages,
 * contract-winner pages, /for/general-contractors, emails): sends each
 * visitor to the right step, carrying the award they came from.
 */
export default async function StartGcPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ award?: string }>;
}) {
  const award = parseAwardRef((await searchParams).award);
  const form = gcFormPath(award);
  const session = await getSession();

  if (!session) redirect(`/sign-up?role=general_contractor${award ? `&award=${encodeURIComponent(award)}` : ""}`);
  if (!session.profile.onboarding_completed) {
    redirect(`/onboarding?kind=gc&next=${encodeURIComponent(form)}`);
  }
  if (session.profile.primary_role === "property_manager") redirect(form);

  // Signed in as a trade, supplier or visitor: packages are posted from a
  // contractor account, which can't also hold a paid trade listing.
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sub-trade packages are posted from a contractor account</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        You&apos;re signed in with a {session.profile.primary_role === "trade" ? "trade" : "non-contractor"} account. To post
        packages for a job you&apos;re running, create a separate general contractor account with another email, or
        email us at <a href={`mailto:${SITE.email}`} className="font-medium text-teal-700 underline">{SITE.email}</a> and
        we&apos;ll post it for you.
      </p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-teal-700 hover:underline">
        ← Back to {SITE.name}
      </Link>
    </div>
  );
}
