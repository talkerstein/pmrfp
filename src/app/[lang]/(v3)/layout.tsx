import "@/components/v3/pages.css";
import { V3Footer, V3Header, V3Sticky, type ChromeCopy } from "@/components/v3/chrome";
import { loadV3Board } from "@/components/v3/data";
import { getT, setLangFrom } from "@/i18n/server";

/**
 * Pages on the v3 design system (Claude Design handoff 2026-10-07): audience
 * landings, simple content pages and the forum. Their own route group so the
 * marketing layout's SiteHeader/SiteFooter don't wrap them; they get the
 * homepage's announcement bar, header, footer and sticky bar instead.
 */
export default async function V3Layout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const lang = await setLangFrom(params);
  const h = getT("homeV3");
  const t: ChromeCopy = { skip: h.skip, founding: { bar: h.founding.bar, barShort: h.founding.barShort, claim: h.founding.claim, limited: h.founding.limited, low: h.founding.low }, nav: h.nav, footer: h.footer, sticky: h.sticky };
  const board = await loadV3Board();
  return (
    <div className="v3-root">
      <V3Header t={t} lang={lang} foundingLeft={board.foundingLeft} />
      <main id="main" tabIndex={-1} className="v3p">
        {children}
      </main>
      <V3Footer t={t} lang={lang} />
      <V3Sticky t={t} lang={lang} open={board.open} closing7={board.closing7} />
    </div>
  );
}
