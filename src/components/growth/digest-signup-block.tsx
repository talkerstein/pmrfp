import { getCategories } from "@/lib/data/taxonomy";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { getLang, getT } from "@/i18n/server";
import { regionName, tradeName } from "@/i18n/terms";
import { DigestSignupForm } from "./digest-signup";

/**
 * The free weekly email sign-up, for any page (homepage, major projects,
 * benchmarks, forum, contract winners). Always renders: sign-up is decoupled
 * from sending (lib/digest/config). Safe on cached pages: it reads only the
 * cached taxonomy, never cookies or headers (the visitor's country is
 * picked up in the browser).
 */
export async function DigestSignupBlock({ source, className }: { source: string; className?: string }) {
  const lang = getLang();
  const t = getT("growth").digest;
  const categories = await getCategories().catch(() => []);
  const places = {
    CA: CA_PROVINCES.map((v) => ({ value: v, label: regionName(v, lang) })),
    US: US_STATE_NAMES.map((v) => ({ value: v, label: regionName(v, lang) })),
  };
  const trades = categories
    .map((c) => ({ slug: c.slug, label: tradeName(c.name, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  return (
    <div className={className ?? "dg-wrap"} data-section="weekly-email">
      <DigestSignupForm source={source} lang={lang} title={t.title} lead={t.lead} privacy={t.privacy} places={places} trades={trades} />
    </div>
  );
}
