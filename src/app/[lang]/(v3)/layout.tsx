import { V3Shell } from "@/components/home-v3/shell";
import { setLangFrom } from "@/i18n/server";

/**
 * Pages built from the Claude Design templates (directory lists, company
 * profile, sign-up). Their own route group so the marketing layout's
 * SiteHeader/SiteFooter don't wrap them: they use the v3 announcement bar,
 * header and footer shared with the homepage.
 */
export default async function V3Layout({ children, params }: { children: React.ReactNode; params: Promise<object> }) {
  const lang = await setLangFrom(params);
  return <V3Shell lang={lang}>{children}</V3Shell>;
}
