import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, Building2, Globe, Mail, Phone, ShieldCheck, Clock } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RequestIntroForm } from "@/components/public/request-intro-form";
import { JsonLd, breadcrumbSchema, localBusinessSchema } from "@/lib/seo/jsonld";
import { getVendor, listVendors } from "@/lib/data/directory";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export async function generateStaticParams() {
  const [trades, suppliers] = await Promise.all([
    listVendors(),
    listVendors({ orgType: "supplier" }),
  ]);
  return [...trades, ...suppliers].map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) return { title: "Vendor not found" };
  const title = `${v.name} — ${[v.city, v.province].filter(Boolean).join(", ")}`;
  const description =
    v.shortDescription ?? `${v.name} on the ${SITE.name} commercial property vendor directory.`;
  const url = `${SITE.url.replace(/\/$/, "")}/directory/${v.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // The colocated opengraph-image.tsx supplies the og:image / twitter:image.
    openGraph: { type: "profile", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) notFound();

  const initials = v.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const showContact = v.contactVisibility === "show_contact";

  return (
    <Container className="py-10">
      <JsonLd data={localBusinessSchema({ name: v.name, slug: v.slug, city: v.city, province: v.province, shortDescription: v.shortDescription, categories: v.categories, logoUrl: v.logoUrl })} />
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Directory", path: "/directory" },
        { name: v.name, path: `/directory/${v.slug}` },
      ])} />
      <Link href="/directory" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to directory
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "relative flex size-16 items-center justify-center overflow-hidden rounded-lg text-xl font-bold",
                v.logoUrl ? "border border-border bg-white" : "bg-indigo text-white",
              )}
            >
              {v.logoUrl ? (
                <Image
                  src={v.logoUrl}
                  alt={v.name}
                  fill
                  sizes="64px"
                  className="object-contain p-1.5"
                  unoptimized={v.logoUrl.endsWith(".svg")}
                />
              ) : (
                initials
              )}
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                {v.name}
                {v.verified && (
                  <span
                    title="Verified by PMRFP. We confirm licensing, insurance, and a real business presence before listing."
                    className="inline-flex"
                  >
                    <BadgeCheck className="size-5 text-success" aria-label="Verified by PMRFP" />
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[v.city, v.province].filter(Boolean).join(", ")}
              </p>
            </div>
            {v.featured && <Badge className="ml-auto bg-teal-100 text-teal-700">Featured</Badge>}
          </div>

          {v.fullDescription && (
            <p className="mt-6 leading-relaxed text-foreground/90">{v.fullDescription}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {v.categories.map((c) => (
              <Badge key={c} variant="secondary">{c}</Badge>
            ))}
          </div>

          {/* Only show facts the vendor actually has — a grid of em-dash
              placeholders reads as a broken/abandoned profile. */}
          {(() => {
            const facts: { icon: React.ReactNode; label: string; value: string }[] = [];
            if (v.yearsInBusiness) facts.push({ icon: <Clock className="size-4" />, label: "Years in business", value: `${v.yearsInBusiness} years` });
            if (v.employeeCountRange) facts.push({ icon: <Building2 className="size-4" />, label: "Team size", value: v.employeeCountRange });
            if (v.insuranceStatus) facts.push({ icon: <ShieldCheck className="size-4" />, label: "Insurance", value: v.insuranceStatus });
            if (v.wsibStatus) facts.push({ icon: <ShieldCheck className="size-4" />, label: "WSIB", value: v.wsibStatus });
            if (facts.length === 0) return null;
            return (
              <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                {facts.map((f) => (
                  <Fact key={f.label} icon={f.icon} label={f.label} value={f.value} />
                ))}
              </dl>
            );
          })()}

          {v.regions.length > 0 && (
            <div className="mt-8">
              <h2 className="eyebrow text-muted-foreground">Service regions</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {v.regions.map((r) => (
                  <Badge key={r} variant="outline">{r}</Badge>
                ))}
              </div>
            </div>
          )}

          {v.propertyTypes.length > 0 && (
            <div className="mt-6">
              <h2 className="eyebrow text-muted-foreground">Property types served</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {v.propertyTypes.map((p) => (
                  <Badge key={p} variant="outline">{p}</Badge>
                ))}
              </div>
            </div>
          )}

          {v.portfolioPhotos.length > 0 && (
            <div className="mt-10">
              <h2 className="eyebrow text-muted-foreground">Portfolio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Past work from {v.name}.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {v.portfolioPhotos.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-secondary/40"
                  >
                    <Image
                      src={url}
                      alt={`${v.name} portfolio photo ${i + 1}`}
                      fill
                      sizes="(min-width: 1024px) 280px, 50vw"
                      className="object-cover transition-transform hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {/* Route through sign-up (PM role preselected) so cold visitors get
              registration, not a password wall; `next` carries them back to
              post-an-RFP-with-this-vendor after account creation. Signed-in
              PMs use the "Sign in" link on that page (also carries next). */}
          <Link
            href={`/sign-up?role=property_manager&next=${encodeURIComponent(`/pm-dashboard/rfps/new?invite=${v.slug}`)}`}
            className={buttonVariants({ className: "mb-2 w-full" })}
          >
            Invite to bid
          </Link>
          <p className="mb-4 text-center text-xs text-muted-foreground">
            Post a project and {v.name} comes to you with a bid. Free for property managers.
          </p>
          <div className="rounded-xl border border-border bg-card p-6">
            {showContact ? (
              <>
                <h2 className="text-base font-semibold">Contact {v.name}</h2>
                <div className="mt-4 space-y-3 text-sm">
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-foreground hover:text-teal-700">
                      <Globe className="size-4 text-muted-foreground" /> Website
                    </a>
                  )}
                  {v.email && (
                    <a href={`mailto:${v.email}`} className="flex items-center gap-2 text-foreground hover:text-teal-700">
                      <Mail className="size-4 text-muted-foreground" /> {v.email}
                    </a>
                  )}
                  {v.phone && (
                    <a href={`tel:${v.phone}`} className="flex items-center gap-2 text-foreground hover:text-teal-700">
                      <Phone className="size-4 text-muted-foreground" /> {v.phone}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold">Request an introduction</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This vendor receives introductions through {SITE.name}. Send a request and we&apos;ll
                  pass it along.
                </p>
                <div className="mt-4">
                  <RequestIntroForm vendorSlug={v.slug} vendorName={v.name} />
                </div>
              </>
            )}
          </div>
          <Link href="/sign-up" className={buttonVariants({ variant: "outline", className: "mt-4 w-full" })}>
            Are you {v.name}? Claim this profile
          </Link>
        </aside>
      </div>
    </Container>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
