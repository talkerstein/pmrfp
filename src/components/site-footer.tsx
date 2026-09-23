import Link from "next/link";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { COPY, FOOTER_COLS, FOOTER_LEGAL, SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-indigo text-indigo-100/80">
      <Container className="py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo className="text-teal-300" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-indigo-100/60">
              {SITE.tagline}
            </p>
            <p className="mt-4 text-xs text-indigo-100/45">
              From the team behind{" "}
              <a
                href={SITE.sisterBrand.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-300 hover:text-teal-200"
              >
                {SITE.sisterBrand.name}
              </a>
              .
            </p>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <div className="eyebrow text-teal-300/80">{col.heading}</div>
              {col.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-indigo-100/70 transition-colors hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-indigo-100/45">
            {COPY.disclaimer}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-100/45">
            <span>
              © {new Date().getFullYear()} {SITE.name}. Commercial property RFPs and tenders, Canada and the U.S.
            </span>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
              {FOOTER_LEGAL.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </Container>
    </footer>
  );
}
