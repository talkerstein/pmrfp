import "@/components/v3-pages/v3-pages.css";
import { V3Footer, V3Top } from "@/components/home-v3/chrome";
import { spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { setLangFrom } from "@/i18n/server";

/**
 * Pages built on the approved v3 design templates (RFP board, RFP detail,
 * pricing). Same chrome as the homepage (announcement bar, header, footer),
 * not the marketing layout's SiteHeader/SiteFooter.
 */
export default async function V3Layout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  await setLangFrom(params);
  const { lang: raw } = await params;
  const lang = hasLocale(raw) ? raw : "en";
  const { skip, founding, nav, footer } = getDictionary(lang).homeV3;
  const t = { founding, nav, footer };
  const sold = await cachedLifetimeCount().catch(() => null);
  return (
    <div className="pmrfp-v3">
      <a href="#main" className="v3-skip">{skip}</a>
      <V3Top t={t} lang={lang} foundingLeft={sold == null ? null : spotsLeft(sold)} />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        {children}
      </main>
      <V3Footer t={t} lang={lang} />
    </div>
  );
}
