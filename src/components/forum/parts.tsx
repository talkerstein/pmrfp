import Link from "@/i18n/link";
import { BadgeCheck, ChevronLeft, ChevronRight, HardHat, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { parseBody, type Inline } from "@/lib/forum/text";
import { ratingLabel } from "@/lib/forum/rules";
import { orgLevel } from "@/lib/karma/data";
import { LevelBadge } from "@/components/karma/level-badge";
import type { MemberRef } from "@/lib/forum/data";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";

/**
 * Member text → elements. No HTML from the database is ever rendered:
 * parseBody returns tokens and each becomes a React element, so markup in a
 * post shows as text. User links are rel="nofollow ugc".
 */
export function PostBody({ text, className }: { text: string; className?: string }) {
  const blocks = parseBody(text);
  return (
    <div className={cn("space-y-3 break-words text-[15px] leading-relaxed text-foreground", className)}>
      {blocks.map((b, i) => (
        <p key={i}>{b.map((t, j) => inline(t, j))}</p>
      ))}
    </div>
  );
}

function inline(t: Inline, key: number) {
  switch (t.t) {
    case "br":
      return <br key={key} />;
    case "bold":
      return <strong key={key}>{t.v}</strong>;
    case "code":
      return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{t.v}</code>;
    case "link":
      return (
        <a key={key} href={t.href} rel="nofollow ugc noopener noreferrer" target="_blank" className="text-primary underline underline-offset-2 hover:no-underline">
          {t.v}
        </a>
      );
    default:
      return <span key={key}>{t.v}</span>;
  }
}

export function RatingBar({ avg, count }: { avg: number | null; count: number }) {
  const t = getT("forum");
  const label = ratingLabel(avg);
  const pct = avg == null ? 0 : Math.round((avg / 5) * 100);
  return (
    <div className="min-w-20" title={label ? `${t.ratings[label]} (${count})` : undefined}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label ? t.ratings[label] : "–"}</div>
    </div>
  );
}

/**
 * A member's name, staff/verified marks and (with showLevel) their
 * company's reputation level. Forum ranks were folded into company
 * reputation (src/lib/karma): the level shown is the company's.
 */
export async function MemberName({ m, staff, showLevel }: { m: MemberRef | null; staff?: boolean; showLevel?: boolean }) {
  const t = getT("forum");
  if (!m) return <span className="text-muted-foreground">–</span>;
  const level = showLevel ? await orgLevel(m.orgId) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Link href={`/forum/u/${m.handle}`} className="font-medium text-foreground hover:underline">
        {m.displayName}
      </Link>
      {staff && (
        <span className="inline-flex items-center gap-0.5 rounded bg-indigo px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <ShieldCheck className="size-3" /> {t.thread.staff}
        </span>
      )}
      {m.verifiedBusiness && <BadgeCheck className="size-4 text-teal-600" aria-label={t.thread.verified} />}
      {level != null && <LevelBadge level={level} short />}
    </span>
  );
}

/**
 * The dark band at the top of every forum page (v3 design): breadcrumbs, a
 * mint kicker, the page's one <h1>, an optional lead and actions.
 */
export function ForumHero({
  eyebrow,
  title,
  lead,
  crumbs,
  icon,
  children,
}: {
  icon?: React.ReactNode;
  eyebrow: string;
  title: string;
  lead?: string;
  crumbs?: { label: string; href?: string }[];
  children?: React.ReactNode;
}) {
  return (
    <section className="f-band">
      <div className="wrap f-band-in">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="f-crumbs">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <p className="kick">{icon ?? <span className="dot" />}{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </section>
  );
}

export function OpeningSoon() {
  const t = getT("forum").soon;
  return (
    <Container className="py-16">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
        <HardHat className="size-10 text-teal-600" />
        <h2 className="mt-4 text-xl font-bold">{t.title}</h2>
        <p className="mt-2 text-muted-foreground">{t.body}</p>
        <Link href="/rfps" className={cn(buttonVariants(), "mt-6")}>{t.cta}</Link>
      </div>
    </Container>
  );
}

/** Shown to readers who can't post yet: how to get verified. */
export function VerifyPanel({ signedIn, next }: { signedIn: boolean; next: string }) {
  const t = getT("forum").verify;
  return (
    // The panel is always light mint, so its text colours are pinned rather
    // than theme tokens (muted-foreground turns pale inside a .dark band).
    <div className="rounded-3xl border-2 border-[#91F2CF] bg-[#DDFBF0] p-6 text-[#1B1D3A]">
      <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-teal-700" /> {t.title}</h2>
      <p className="mt-1 text-sm text-[#4B4F6B]">{t.body}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {t.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3">
        {signedIn ? (
          <Link href="/onboarding" className={buttonVariants()}>{t.cta}</Link>
        ) : (
          <>
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={buttonVariants()}>{t.signIn}</Link>
            <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>{t.cta}</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function Pager({ base, page, total, query = "" }: { base: string; page: number; total: number; query?: string }) {
  const t = getT("forum").category;
  if (total <= 1) return null;
  const href = (n: number) => (n <= 1 ? base : `${base}/page/${n}`) + query;
  return (
    <nav className="mt-6 flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="inline-flex items-center gap-1 text-primary hover:underline">
          <ChevronLeft className="size-4" /> {t.prev}
        </Link>
      ) : <span />}
      <span className="text-muted-foreground">{fmt(t.page, { n: page, total })}</span>
      {page < total ? (
        <Link href={href(page + 1)} className="inline-flex items-center gap-1 text-primary hover:underline">
          {t.next} <ChevronRight className="size-4" />
        </Link>
      ) : <span />}
    </nav>
  );
}
