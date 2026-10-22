import { Compass } from "lucide-react";
import { Block } from "./blocks";
import { PLATFORM_LINKS, type GuidePlatform } from "@/lib/rfp-detail/platforms";
import { getLang, getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/**
 * "How to bid on {platform}" (depth plan, Step 2, block 8): a short guide for
 * a platform whose facts and links were read on its own public pages on
 * 2026-10-22, with a link to the platform's own registration or help page.
 * It says "as of Oct 2026" and that PMRFP hosts nothing: documents, addenda
 * and bid submission are on the platform.
 */
export function PlatformGuide({ platform }: { platform: GuidePlatform }) {
  const t = getT("rfpDepth").platform;
  const lang = getLang();
  const guide = t.guides[platform];
  const links = PLATFORM_LINKS[platform];
  const name = guide.name;
  // The platform's help pages are in one language: say so when it isn't the page's.
  const helpLang = platform === "seao" ? "fr" : "en";
  const note = helpLang === lang ? "" : ` ${helpLang === "fr" ? t.inFrench : t.inEnglish}`;
  return (
    <Block id="platform" icon={<Compass className="size-4 text-teal-700" aria-hidden />} title={fmt(t.title, { platform: name })} sub={t.asOf}>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm" data-platform={platform}>
        {guide.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a href={links.help} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:underline" data-link="platform-help">{t.help} ↗{note}</a>
        <a href={links.home} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:underline" data-link="platform-home">{fmt(t.home, { platform: name })} ↗</a>
      </p>
      <p className="mt-3 text-xs text-muted-foreground">{fmt(t.hosting, { platform: name })}</p>
    </Block>
  );
}
