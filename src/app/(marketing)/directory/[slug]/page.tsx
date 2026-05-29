import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Building2, Globe, Mail, Phone, ShieldCheck, Clock } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RequestIntroForm } from "@/components/public/request-intro-form";
import { getVendor } from "@/lib/data/directory";
import { SITE } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = await getVendor(slug);
  if (!v) return { title: "Vendor not found" };
  return {
    title: `${v.name} — ${[v.city, v.province].filter(Boolean).join(", ")}`,
    description: v.shortDescription ?? `${v.name} on the ${SITE.name} commercial property vendor directory.`,
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
      <Link href="/directory" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to directory
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-navy text-xl font-bold text-white">
              {v.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt={v.name} className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                {v.name}
                {v.verified && <BadgeCheck className="size-5 text-success" />}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[v.city, v.province].filter(Boolean).join(", ")}
              </p>
            </div>
            {v.featured && <Badge className="ml-auto bg-gold-100 text-gold-700">Featured</Badge>}
          </div>

          {v.fullDescription && (
            <p className="mt-6 leading-relaxed text-foreground/90">{v.fullDescription}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {v.categories.map((c) => (
              <Badge key={c} variant="secondary">{c}</Badge>
            ))}
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <Fact icon={<Clock className="size-4" />} label="Years in business" value={v.yearsInBusiness ? `${v.yearsInBusiness} years` : "—"} />
            <Fact icon={<Building2 className="size-4" />} label="Team size" value={v.employeeCountRange ?? "—"} />
            <Fact icon={<ShieldCheck className="size-4" />} label="Insurance" value={v.insuranceStatus ?? "—"} />
            <Fact icon={<ShieldCheck className="size-4" />} label="WSIB" value={v.wsibStatus ?? "—"} />
          </dl>

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
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-6">
            {showContact ? (
              <>
                <h2 className="text-base font-semibold">Contact {v.name}</h2>
                <div className="mt-4 space-y-3 text-sm">
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-foreground hover:text-gold-700">
                      <Globe className="size-4 text-muted-foreground" /> Website
                    </a>
                  )}
                  {v.email && (
                    <a href={`mailto:${v.email}`} className="flex items-center gap-2 text-foreground hover:text-gold-700">
                      <Mail className="size-4 text-muted-foreground" /> {v.email}
                    </a>
                  )}
                  {v.phone && (
                    <a href={`tel:${v.phone}`} className="flex items-center gap-2 text-foreground hover:text-gold-700">
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
