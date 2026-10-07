import type { Metadata } from "next";
import Link from "@/i18n/link";
import { Ban, Check, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).marketplace.meta;
  return { title: { absolute: t.rulesTitle }, description: t.rulesDescription, alternates: alternatesFor(l, "/marketplace/rules") };
}

export default async function MarketplaceRulesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("marketplace").rules;
  return (
    <Container className="max-w-3xl py-12">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal-700">{t.eyebrow}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{t.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t.lead}</p>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Ban className="size-5 text-destructive" /> {t.prohibitedTitle}</h2>
        <ul className="mt-4 space-y-3">
          {t.prohibited.map((p) => (
            <li key={p} className="flex gap-2 rounded-lg border border-border bg-card p-3 text-sm leading-relaxed">
              <Ban className="mt-0.5 size-4 shrink-0 text-destructive" /> {p}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Check className="size-5 text-teal-700" /> {t.allowedTitle}</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed">
          {t.allowed.map((p) => (
            <li key={p} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-700" /> {p}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5 text-teal-700" /> {t.howTitle}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {t.how.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>
      <Link href="/marketplace/new" className={buttonVariants({ className: "mt-6" })}>{t.cta}</Link>
    </Container>
  );
}
