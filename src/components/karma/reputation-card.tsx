import Link from "@/i18n/link";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { getOrgReputation, type LedgerRow } from "@/lib/karma/data";
import { levelSlug } from "@/lib/karma/rules";
import { LevelBadge } from "./level-badge";

/**
 * Dashboard "Your reputation" card: level, private score, progress to the
 * next level, the ledger ("how you earned it") and what to do next.
 * Only render it for the signed-in member's OWN company: the caller passes
 * session.organization.id.
 */
export async function ReputationCard({ orgId, audience }: { orgId: string | null | undefined; audience: "trade" | "pm" }) {
  if (!orgId) return null;
  const k = getT("karma");
  const c = k.card;
  const lang = getLang();
  const rep = await getOrgReputation(orgId);
  const n = (x: number) => formatNumber(x, lang);

  if (!rep.ready) {
    return (
      <section className="mt-6 rounded-lg border border-border bg-card p-6" data-card="reputation">
        <h2 className="text-base font-semibold">{c.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.unavailable}</p>
      </section>
    );
  }

  const has = (kind: keyof typeof rep.byKind) => (rep.byKind[kind] ?? 0) > 0;
  const hints: string[] = [];
  if (!has("profile_approved")) hints.push(c.hints.profile_approved);
  if (!has("vendor_verified")) hints.push(c.hints.vendor_verified);
  if (audience === "trade") hints.push(c.hints.project_verified_review, c.hints.forum, c.hints.gc);
  else hints.push(c.hints.rfp, c.hints.forum);

  const p = rep.progress;
  const shown = rep.ledger.slice(0, 6);
  const rest = rep.ledger.slice(6);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-card="reputation">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{c.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{c.lead}</p>
        </div>
        <LevelBadge level={rep.level} always className="text-xs" />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.score}</div>
          <div className="text-3xl font-bold tabular-nums" data-score>{n(rep.score)}</div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(k.badge.label, { n: rep.level, name: k.levels[levelSlug(rep.level)] })}</span>
            <span>{p.next ? fmt(c.toNext, { n: n(p.toNext), next: p.next, name: k.levels[levelSlug(p.next)] }) : c.top}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${p.percent}%` }} />
          </div>
        </div>
      </div>

      {rep.decay < 1 && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {fmt(c.decay, { pct: Math.round(rep.decay * 100), pts: n(rep.raw) })}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">{c.ledger}</h3>
          {rep.ledger.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{c.ledgerEmpty}</p>
          ) : (
            <>
              <LedgerList rows={shown} />
              {rest.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-primary">{fmt(c.showAll, { n: n(rep.ledger.length) })}</summary>
                  <LedgerList rows={rest} />
                </details>
              )}
            </>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{c.nextSteps}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {hints.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <p className="mt-3 text-sm"><Link href="/reputation" className="font-medium text-primary hover:underline">{c.how} →</Link></p>
        </div>
      </div>
    </section>
  );
}

function LedgerList({ rows }: { rows: LedgerRow[] }) {
  const k = getT("karma");
  const c = k.card;
  const lang = getLang();
  return (
    <ul className="mt-2 divide-y divide-border text-sm" data-list="ledger">
      {rows.map((r) => {
        const status = r.reversed ? c.reversed : r.capped ? c.capped[r.capped] : null;
        return (
          <li key={r.id} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className={r.reversed || r.capped ? "text-muted-foreground line-through" : undefined}>{k.kinds[r.kind]}</span>
              {r.reason && <span className="block text-xs text-muted-foreground">{r.reason}</span>}
              <span className="block text-xs text-muted-foreground">
                {formatDate(r.createdAt, lang)}
                {status && ` · ${status}`}
              </span>
            </span>
            <span className={`shrink-0 tabular-nums font-semibold ${r.counted < 0 ? "text-red-600" : r.counted > 0 ? "text-teal-700" : "text-muted-foreground"}`}>
              {r.points > 0 ? "+" : ""}{formatNumber(r.points, lang)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
