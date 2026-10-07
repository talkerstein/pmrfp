import Link from "@/i18n/link";
import { BadgeCheck, ChevronLeft, ChevronRight, HardHat, ShieldCheck } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { parseBody, type Inline } from "@/lib/forum/text";
import { rankFor, ratingLabel } from "@/lib/forum/rules";
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

export function RankBar({ reputation }: { reputation: number }) {
  const t = getT("forum");
  const r = rankFor(reputation);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{t.ranks[r.rank]}</span>
        <span className="text-xs text-muted-foreground">
          {r.next ? fmt(t.profile.toNext, { n: r.toNext, rank: t.ranks[r.next] }) : t.profile.topRank}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={r.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-teal-500" style={{ width: `${r.percent}%` }} />
      </div>
    </div>
  );
}

export function MemberName({ m, staff, showRank }: { m: MemberRef | null; staff?: boolean; showRank?: boolean }) {
  const t = getT("forum");
  if (!m) return <span className="text-muted-foreground">–</span>;
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
      {showRank && <span className="text-xs text-muted-foreground">{t.ranks[rankFor(m.reputation).rank]}</span>}
    </span>
  );
}

export function ForumHero({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
      <Container className="relative py-10 md:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal-300">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-balance text-3xl font-extrabold tracking-tight text-white md:text-4xl">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-indigo-100/80">{lead}</p>}
        {children}
      </Container>
    </section>
  );
}

export function OpeningSoon() {
  const t = getT("forum").soon;
  return (
    <Container className="py-16">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
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
    <div className="rounded-xl border border-teal-500/50 bg-teal-50/40 p-5 dark:bg-teal-500/5">
      <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-teal-600" /> {t.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
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

export function Pager({ base, page, total }: { base: string; page: number; total: number }) {
  const t = getT("forum").category;
  if (total <= 1) return null;
  const href = (n: number) => (n <= 1 ? base : `${base}/page/${n}`);
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
