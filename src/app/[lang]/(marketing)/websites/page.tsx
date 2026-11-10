import type { Metadata } from "next";
import { ArrowRight, Building2, Camera, ClipboardList, CreditCard, Info, MapPin, ShieldCheck, Star, Wrench } from "lucide-react";
import { Container, Eyebrow } from "@/components/container";
import { Section, SectionHeading } from "@/components/public/section";
import { WebsiteEnquiryForm } from "@/components/forms/website-enquiry-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEBSITES } from "@/lib/websites/config";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).websites.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/websites") };
}

/** Prices for the {placeholders} in the copy (lib/websites/config.ts). */
const f = (s: string) => fmt(s, { pmFrom: WEBSITES.pmFrom, tradeMonthly: WEBSITES.tradeMonthly });

/**
 * Websites that plug into PMRFP, built and billed by Talkerstein Consulting
 * Group (PMRFP's affiliate, disclosed on the page). Two doors: a site for
 * property-management firms and a Proof Site for trades. Enquiry only: both
 * forms post to /api/contact. Copy lives in messages/websites.ts, in the
 * same order as `points` here.
 */
const DOORS = [
  { key: "pm", icon: Building2, anchor: "#pm", points: [ClipboardList, CreditCard, Wrench, MapPin] },
  { key: "trade", icon: Camera, anchor: "#trade", points: [Camera, Star, MapPin, ShieldCheck] },
] as const;

export default async function WebsitesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("websites");
  return (
    <>
      <section className="border-b border-border bg-background">
        <Container className="py-20 sm:py-24">
          <div className="max-w-3xl">
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">{t.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t.lead}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {DOORS.map((d, i) => (
              <a key={d.key} href={d.anchor} className={buttonVariants({ size: "lg", variant: i ? "outline" : "accent" })}>
                <d.icon className="size-4" /> {t.doors[d.key].tag}
              </a>
            ))}
          </div>
          <div className="mt-8 flex max-w-3xl items-start gap-3 rounded-lg border border-border bg-secondary/40 px-5 py-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium text-foreground">{t.disclosureLabel}</span> {t.disclosure}
            </p>
          </div>
        </Container>
      </section>

      {DOORS.map((d, i) => {
        const copy = t.doors[d.key];
        return (
          <Section key={d.key} tone={i % 2 ? "muted" : "default"}>
            <div id={d.key} className="grid scroll-mt-24 gap-10 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-teal-700">{copy.tag}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{copy.headline}</h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">{copy.blurb}</p>
                <p className="mt-5 text-lg font-medium text-indigo">{f(copy.price)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.priceNote}</p>
                <a href={`#start-${d.key}`} className={cn(buttonVariants({ size: "lg", variant: "accent" }), "mt-6")}>
                  {copy.cta} <ArrowRight className="size-4" />
                </a>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {d.points.map((Icon, j) => {
                  const text = copy.points[j];
                  return (
                    <li key={text.t} className="rounded-xl border border-border bg-card p-5">
                      <Icon className="size-5 text-teal-600" />
                      <p className="mt-3 font-semibold text-foreground">{text.t}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text.d}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Section>
        );
      })}

      <Section>
        <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.how.steps.map((s, i) => (
            <li key={s.t} className="rounded-xl border border-border bg-card p-5">
              <p className="font-mono text-xs text-teal-700">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-3 font-semibold text-foreground">{s.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow={t.own.eyebrow} title={t.own.title} />
        <ul className="mt-10 grid gap-4 lg:grid-cols-3">
          {t.own.points.map((p) => (
            <li key={p.t} className="rounded-xl border border-border bg-card p-5">
              <p className="font-semibold text-foreground">{p.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.d}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHeading eyebrow={t.form.eyebrow} title={t.form.title} />
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {DOORS.map((d) => (
            <div key={d.key} id={`start-${d.key}`} className="scroll-mt-24 rounded-xl border border-border bg-card p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <d.icon className="size-5 text-teal-600" /> {d.key === "pm" ? t.form.pmTitle : t.form.tradeTitle}
              </h3>
              <div className="mt-5">
                <WebsiteEnquiryForm
                  kind={d.key}
                  labels={{
                    website: t.form.website,
                    message: d.key === "pm" ? t.form.pmMessage : t.form.tradeMessage,
                    send: t.form.send,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
