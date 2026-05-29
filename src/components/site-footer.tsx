import Link from "next/link";
import { Container } from "@/components/container";
import { COPY, FOOTER_COLS, SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-navy text-slate-300">
      <Container className="py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-1">
            <span className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-gold-500 text-[13px] font-bold tracking-tight text-navy">
                PM
              </span>
              <span className="text-lg font-semibold tracking-tight text-white">
                {SITE.name}
              </span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              {SITE.tagline}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              From the team behind{" "}
              <a
                href={SITE.sisterBrand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-400 hover:text-gold-300"
              >
                {SITE.sisterBrand.name}
              </a>
              .
            </p>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <div className="eyebrow text-slate-500">{col.heading}</div>
              {col.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-slate-300 transition-colors hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-slate-ink pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
            {COPY.disclaimer}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              © {new Date().getFullYear()} {SITE.name}. {SITE.country}-first commercial
              property RFP network.
            </span>
            <span>pmrfp.com</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
