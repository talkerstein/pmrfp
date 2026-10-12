import { getKarmaBadgeInfo } from "@/lib/badge/data";
import { KARMA_BADGE_MIN_LEVEL, parseBadgeLang, renderKarmaBadge } from "@/lib/badge/svg";
import { badgeResponse } from "@/lib/badge/respond";
import karma from "@/i18n/messages/karma";

// No `dynamic = "force-dynamic"`: it would switch off the data cache for the reads
// below. Reading the Referer header already makes every request run.

type LevelKey = keyof (typeof karma)["en"]["levels"];

/** "Reputation · level N" for a listed company at level 2+; below that, the plain seal. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const lang = parseBadgeLang(url.searchParams.get("lang"));
  const info = await getKarmaBadgeInfo(slug).catch(() => null);
  const levelName = info?.levelSlug ? karma[lang].levels[info.levelSlug as LevelKey] : "";
  const svg = renderKarmaBadge({ found: Boolean(info?.found), level: info?.level ?? null, levelName }, theme, lang);
  const live = Boolean(info?.found && info.level && info.level >= KARMA_BADGE_MIN_LEVEL);
  return badgeResponse(request, "karma", slug, svg, live);
}
