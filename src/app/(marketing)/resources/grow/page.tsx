import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  MapPin,
  Megaphone,
  PenTool,
  Sparkles,
  Star,
} from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { CTASection } from "@/components/public/section";
import { buttonVariants } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Opening or Growing a Business? Done-For-You Setup",
  description:
    "Just starting out or ready to grow? Get your trade business online — professional branding, a website, your Google profile, and a polished PMRFP listing, done for you.",
  alternates: { canonical: "/resources/grow" },
};

const INCLUDED = [
  { icon: PenTool, t: "Brand & logo", d: "A clean, professional identity that makes property managers take you seriously." },
  { icon: Globe, t: "Website", d: "A fast, modern site that shows your work, services, and credentials — and turns visitors into calls." },
  { icon: MapPin, t: "Google Business Profile", d: "Set up and optimized so you show up when local buyers search for your trade." },
  { icon: Star, t: "Polished PMRFP listing", d: "A complete, credible directory profile that wins the click over your competitors." },
  { icon: Megaphone, t: "Marketing to get going", d: "The essentials to start getting found — so the work comes to you." },
];

export default function GrowPage() {
  return (
    <>
      {/* Hero */}
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.07)]">
        <Container className="relative z-10 py-20 sm:py-24">
          <div className="max-w-3xl">
            <span className="eyebrow inline-flex items-center gap-2 text-teal-300">
              <span className="h-px w-5 bg-teal-300" /> Grow your business
            </span>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
              Opening a business — or ready to look the part?
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/75">
              The trades that win commercial work look credible online. If your business is new — or
              still running on a logo from 2009 and no real website — we&apos;ll get you set up,
              done for you, so you show up like the professional you are.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className={buttonVariants({ size: "lg", variant: "accent" })}>
                Get help getting online <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white",
                )}
              >
                List your company first
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* What's included */}
      <Container className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <Eyebrow>Done for you</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to look established.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            One team handles the whole setup so you can stay on the tools. Pick the pieces you need
            — or the full package.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
          <div className="flex flex-col justify-center rounded-xl border border-teal-300 bg-teal-50 p-6">
            <Sparkles className="size-6 text-teal-600" />
            <h3 className="mt-3 text-lg font-semibold text-indigo">The full package</h3>
            <p className="mt-2 text-sm leading-relaxed text-teal-700">
              Brand + website + Google profile + a standout {SITE.name} listing — handled end to end,
              with member-friendly pricing.
            </p>
          </div>
        </div>
      </Container>

      <CTASection
        title="Tell us where your business is at."
        description="New, growing, or rebranding — share a few details and we'll come back with a simple plan to get you looking established and easy to find."
        primaryHref="/contact"
        primaryLabel="Request your setup plan"
        secondaryHref="/resources"
        secondaryLabel="Back to resources"
      />
    </>
  );
}
