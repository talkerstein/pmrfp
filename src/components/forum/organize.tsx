import Link from "@/i18n/link";
import {
  Briefcase, Building2, Calculator, CheckCircle2, CircleHelp, Coffee, Droplets, Fan, FileCheck, Flag, HardHat, Landmark,
  Lock, MapPin, MessageSquare, MessagesSquare, Mountain, PaintRoller, Pin, Search, Sparkles, Store, Trees, Truck, Users,
  Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { ForumCategorySlug } from "@/lib/forum/categories";
import type { ThreadSummary } from "@/lib/forum/data";
import { THREAD_SORTS, sortQuery, timeAgo, type ThreadSort } from "@/lib/forum/organize";
import { getLang, getT } from "@/i18n/server";
import { fmt, plural } from "@/i18n/format";
import { cn } from "@/lib/utils";

const ICONS: Record<ForumCategorySlug, LucideIcon> = {
  "job-site-stories": HardHat,
  "client-talk": Users,
  "business-pricing": Calculator,
  "jobs-hiring": Briefcase,
  "tools-gear": Truck,
  "marketplace-talk": Store,
  "codes-permits": FileCheck,
  "off-topic": Coffee,
  electrical: Zap,
  "hvac-mechanical": Fan,
  plumbing: Droplets,
  "roofing-envelope": Mountain,
  "painting-finishes": PaintRoller,
  "concrete-structure": Building2,
  "landscaping-snow": Trees,
  "cleaning-janitorial": Sparkles,
  "property-managers": Landmark,
  "condo-boards": Building2,
  "general-contractors": Wrench,
  "suppliers-equipment": Truck,
  quebec: Flag,
  ontario: MapPin,
  alberta: MapPin,
  "british-columbia": MapPin,
  "united-states": MapPin,
};

export function ForumIcon({ slug, className }: { slug: ForumCategorySlug; className?: string }) {
  const Icon = ICONS[slug] ?? MessageSquare;
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />;
}

/** Type badge + answered/solved state for a thread. */
export function ThreadBadges({ th }: { th: ThreadSummary }) {
  const t = getT("forum");
  const o = t.org;
  return (
    <>
      <span className="inline-flex items-center gap-1 rounded bg-[#EEEFF6] px-1.5 py-0.5 text-[11px] font-semibold text-[#282B59]">
        {th.type === "question" ? <CircleHelp className="size-3" aria-hidden /> : <MessagesSquare className="size-3" aria-hidden />}
        {th.type === "question" ? t.category.question : t.category.discussion}
      </span>
      {th.hasAccepted ? (
        <span className="inline-flex items-center gap-1 rounded bg-[#DDFBF0] px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">
          <CheckCircle2 className="size-3" aria-hidden /> {o.solved}
        </span>
      ) : th.type === "question" ? (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{th.replyCount === 0 ? o.unanswered : o.open}</span>
      ) : null}
      {th.isLocked && <Lock className="size-3 text-muted-foreground" aria-label={t.category.locked} />}
    </>
  );
}

/** One compact thread line: title, badges, forum, replies, last activity, region. */
export function ThreadLine({ th, forum, pinned }: { th: ThreadSummary; forum?: ForumCategorySlug; pinned?: boolean }) {
  const t = getT("forum");
  const lang = getLang();
  return (
    <li className={cn("flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4", pinned && "bg-amber-50/60")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {pinned && <Pin className="size-3.5 shrink-0 text-amber-600" aria-label={t.category.pinned} />}
          <Link href={th.path} className="truncate font-semibold text-[#1B1D3A] hover:underline" lang={forum === "quebec" ? "fr-CA" : undefined}>{th.title}</Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#4B4F6B]">
          <ThreadBadges th={th} />
          {forum && (
            <Link href={`/forum/${forum}`} className="inline-flex items-center gap-1 hover:underline">
              <ForumIcon slug={forum} className="size-3" /> {t.categories[forum].name}
            </Link>
          )}
          {th.region && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{th.region}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-[#4B4F6B] tabular-nums">
        <span>{plural(th.replyCount, t.org.replies)}</span>
        <time dateTime={th.lastPostAt}>{fmt(t.org.lastActivity, { ago: timeAgo(th.lastPostAt, lang) })}</time>
      </div>
    </li>
  );
}

export function ThreadList({ items, empty, pinnedIds }: { items: { th: ThreadSummary; forum?: ForumCategorySlug }[]; empty: string; pinnedIds?: Set<string> }) {
  if (items.length === 0) return <p className="rounded-2xl border-2 border-dashed border-[#D5D7E6] px-5 py-6 text-sm text-[#4B4F6B]">{empty}</p>;
  return (
    <ul className="divide-y divide-[#E3E4EE] overflow-hidden rounded-2xl border-2 border-[#E3E4EE] bg-white">
      {items.map(({ th, forum }) => <ThreadLine key={th.id} th={th} forum={forum} pinned={pinnedIds?.has(th.id)} />)}
    </ul>
  );
}

/** Latest · Unanswered · Top rated · Solved (via ?sort=, canonical stays the base). */
export function SortTabs({ base, current }: { base: string; current: ThreadSort }) {
  const o = getT("forum").org;
  return (
    <nav aria-label={o.tabsLabel} className="mb-4 flex flex-wrap gap-2">
      {THREAD_SORTS.map((s) => (
        <Link
          key={s}
          href={`${base}${sortQuery(s)}`}
          aria-current={s === current ? "page" : undefined}
          rel={s === "latest" ? undefined : "nofollow"}
          className={cn(
            "rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold",
            s === current ? "border-[#1B1D3A] bg-[#1B1D3A] text-white" : "border-[#E3E4EE] text-[#282B59] hover:border-[#282B59]",
          )}
        >
          {o.tabs[s]}
        </Link>
      ))}
    </nav>
  );
}

/** GET form to /forum?q= (server search). */
export function ForumSearch({ action, q, className }: { action: string; q?: string | null; className?: string }) {
  const o = getT("forum").org;
  return (
    <form action={action} method="get" role="search" className={cn("flex w-full max-w-xl items-center gap-2", className)}>
      <label className="relative flex-1">
        <span className="sr-only">{o.searchLabel}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#4B4F6B]" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          minLength={2}
          maxLength={80}
          placeholder={o.searchPlaceholder}
          className="h-11 w-full rounded-full border-2 border-[#E3E4EE] bg-white pl-9 pr-4 text-sm text-[#1B1D3A] outline-none focus:border-[#282B59]"
        />
      </label>
      <button type="submit" className="btn ink">{o.searchButton}</button>
    </form>
  );
}
