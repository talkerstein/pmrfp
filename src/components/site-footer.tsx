import Link from "@/i18n/link";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { FOOTER_COLS, FOOTER_LEGAL, REFERRAL, SITE } from "@/lib/site";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getDictionary } from "@/i18n/dictionaries";
import { fmt } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

type FooterKey = keyof ReturnType<typeof getDictionary>["common"]["footer"]["links"];
const LINK_KEY: Record<string, FooterKey> = {
  "/rfps": "rfps", "/jobs": "jobs", "/forum": "forum", "/talent": "talent", "/marketplace": "marketplace", "/contract-winners": "winners",
  "/reports/public-building-contracts": "report", "/trades": "trades", "/regions": "regions", "/ontario": "ontario", "/alberta": "alberta", "/toronto-contracts": "toronto", "/suppliers": "suppliers",
  "/for-trades": "forTrades", "/for-property-managers": "forPms", "/become-a-supplier": "becomeSupplier", "/for/real-estate": "forRealtors", "/for": "solutions",
  "/get-found": "getFound", "/pricing": "pricing", "/advertise": "advertise",
  "/rfp-writer": "writer", "/rfp-templates": "templates", "/cost-guides": "costGuides", "/resources": "guides",
  "/case-studies": "caseStudies", "/vs": "compare", "/badge": "badge", "/widgets": "widgets",
  "/services-for-trades": "services", "/refer-a-trade": "refer",
  "/about": "about", "/contact": "contact", "/terms": "terms", "/privacy": "privacy", "/disclaimer": "disclaimer",
};
const COL_KEY = ["work", "who", "resources"] as const;

export function SiteFooter({ lang }: { lang: Locale }) {
  const t = getDictionary(lang).common;
  const label = (href: string, fallback: string) =>
    LINK_KEY[href] ? fmt(t.footer.links[LINK_KEY[href]], { fee: REFERRAL.tradeFee }) : fallback;
  return (
    <footer className="bg-indigo text-indigo-100/80">
      <Container className="py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo className="text-teal-300" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-indigo-100/60">
              {t.meta.tagline}
            </p>
            <p className="mt-4 text-xs text-indigo-100/45">
              {t.footer.sister.split("{brand}")[0]}
              <a
                href={SITE.sisterBrand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-300 hover:text-teal-200"
              >
                {SITE.sisterBrand.name}
              </a>
              {t.footer.sister.split("{brand}")[1]}
            </p>
            <LanguageSwitcher tone="dark" className="mt-5" />
          </div>

          {FOOTER_COLS.map((col, i) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <div className="eyebrow text-teal-300/80">{t.footer.cols[COL_KEY[i]]}</div>
              {col.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-indigo-100/70 transition-colors hover:text-white"
                >
                  {label(l.href, l.label)}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-indigo-100/45">
            {t.disclaimer}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-100/45">
            <span>
              © {new Date().getFullYear()} {SITE.name}. {t.footer.copyright}
            </span>
            <nav aria-label={t.footer.legal} className="flex flex-wrap gap-x-4 gap-y-1">
              {FOOTER_LEGAL.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-white">
                  {label(l.href, l.label)}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </Container>
    </footer>
  );
}
