import type { ReactNode } from "react";
import Link from "@/i18n/link";
import { TrialStartForm } from "@/components/leads/trial";
import { getLang, getT } from "@/i18n/server";

/**
 * The shell every tender-page block shares (depth plan, Step 2): a card with
 * a heading, an optional one-line subtitle and its content. Server component;
 * `data-block` is the hook tests and the browser checks use.
 */
export function Block({
  id,
  icon,
  title,
  sub,
  tone = "plain",
  children,
}: {
  id: string;
  icon?: ReactNode;
  title: string;
  sub?: string;
  tone?: "plain" | "teal";
  children: ReactNode;
}) {
  return (
    <section data-block={id} className={`rounded-xl border p-5 ${tone === "teal" ? "border-teal-400/50 bg-teal-50/40" : "border-border bg-card"}`}>
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        {icon}
        <span>{title}</span>
      </h2>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

/**
 * "Try Trade Pro free for 14 days": a one-click trial for visitors and
 * eligible free accounts (a visitor is sent to sign up first), else a link
 * to the plans. Never a way to hide the free parts of a block.
 */
export function ProCta({ trial, plansHref }: { trial: boolean; plansHref: string }) {
  const t = getT("rfpDepth").cta;
  const lang = getLang();
  if (!trial) {
    return (
      <Link href={plansHref} className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-indigo-700" data-cta="see-plans">
        {t.seePlans}
      </Link>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3" data-cta="listing-trial">
      <TrialStartForm source="listing" label={t.tryPro} lang={lang} />
      <span className="text-xs text-muted-foreground">{t.note}</span>
    </div>
  );
}
