import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Quote } from "lucide-react";
import { Container } from "@/components/container";
import { DirectoryCard } from "@/components/public/directory-card";
import { buttonVariants } from "@/components/ui/button";
import { getPublicTrustedList } from "@/lib/trusted/data";
import { telHref } from "@/lib/trusted/rules";
import { QuoteRequest } from "@/components/trusted/quote-request";
import { cn } from "@/lib/utils";

// Owners' edits call revalidatePath; this is the fallback refresh.
export const revalidate = 300;

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const page = await getPublicTrustedList(handle);
  if (!page) return { title: "Page not found" };
  const who = page.list.brokerage ? `${page.list.displayName}, ${page.list.brokerage}` : page.list.displayName;
  const title = `${page.list.displayName}'s trusted trades`;
  const description = page.list.headline ?? `The trades ${who} trusts with clients' homes and buildings.`;
  return {
    title,
    description,
    // A personal page: share it, don't rank it. Links still pass to the trades' profiles.
    robots: { index: false, follow: true },
    alternates: { canonical: `/trusted/${handle}` },
    openGraph: { title, description, url: `/trusted/${handle}` },
  };
}

export default async function TrustedPage({ params }: Props) {
  const { handle } = await params;
  const page = await getPublicTrustedList(handle);
  if (!page) notFound();
  const { list, trades, pro } = page;
  const first = list.displayName.split(/\s+/)[0];
  const tel = pro && list.contactPhone ? telHref(list.contactPhone) : null;
  const mail = pro && list.contactEmail ? `mailto:${list.contactEmail}` : null;

  return (
    <>
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[560px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(145,242,207,.14), transparent 62%)" }}
        />
        <Container className="relative py-14 md:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal-300">Trusted trades</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight text-white md:text-5xl">{list.displayName}</h1>
          {list.brokerage && <p className="mt-2 text-lg text-indigo-100/80">{list.brokerage}</p>}
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/85">
            {list.headline ?? `The trades ${first} trusts with clients' homes and buildings.`}
          </p>
          {(tel || mail) && (
            <div className="mt-8 flex flex-wrap gap-3">
              {tel && (
                <a href={tel} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
                  <Phone className="size-4" /> Call {first}
                </a>
              )}
              {mail && (
                <a
                  href={mail}
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white active:scale-[0.98]",
                  )}
                >
                  <Mail className="size-4" /> Email {first}
                </a>
              )}
            </div>
          )}
        </Container>
      </section>

      <section className="bg-background">
        <Container className="py-14 md:py-16">
          {trades.length === 0 ? (
            <p className="text-muted-foreground">{first} hasn&apos;t added any trades yet.</p>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {trades.map((t) => (
                <li key={t.organizationId} className="flex flex-col gap-3">
                  <DirectoryCard vendor={t.vendor} />
                  {t.note && (
                    <p className="flex gap-2 rounded-xl border-l-4 border-teal-400 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-foreground">
                      <Quote className="mt-0.5 size-4 shrink-0 text-teal-600" />
                      <span>
                        {t.note} <span className="text-muted-foreground">{first}</span>
                      </span>
                    </p>
                  )}
                  <QuoteRequest
                    handle={list.handle}
                    organizationId={t.organizationId}
                    tradeName={t.vendor.name}
                    recommender={first}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {list.displayName} chose these companies. Each one is listed on PMRFP, where property managers and realtors
            find trades. Always confirm licensing, insurance and pricing for your own project.
          </p>
        </Container>
      </section>

      <section className="border-t border-border bg-secondary/40">
        <Container className="grid gap-6 py-10 md:grid-cols-2">
          <div>
            <h2 className="font-semibold">Realtor? Make your own page.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save the trades you trust, add a note on each, and send clients one link. Free for up to 5 trades.
            </p>
            <Link href="/sign-up?role=real_estate_agent" className={buttonVariants({ className: "mt-4" })}>
              Create your trusted-trades page
            </Link>
          </div>
          <div>
            <h2 className="font-semibold">Run a trade company?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Get listed free so realtors and property managers can add you to their pages.
            </p>
            <Link href="/sign-up?role=trade" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
              List your company
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
