import "@/components/v3-pages/v3-pages.css";
import { V3Shell } from "@/components/home-v3/shell";
import { setLangFrom } from "@/i18n/server";

/**
 * Every page built on the approved v3 design templates (RFP board/detail,
 * pricing, directory lists, company profile, sign-up, audience landings,
 * forum, simple pages). Same chrome as the homepage, not the marketing
 * layout's SiteHeader/SiteFooter.
 */
export default async function V3Layout({ children, params }: { children: React.ReactNode; params: Promise<object> }) {
  const lang = await setLangFrom(params);
  return <V3Shell lang={lang}>{children}</V3Shell>;
}
