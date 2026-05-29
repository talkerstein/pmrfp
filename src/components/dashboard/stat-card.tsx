import Link from "next/link";

export function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-gold-300">
      <div className="eyebrow text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="mb-6 rounded-lg border border-dashed border-gold-300 bg-gold-50/60 p-3 text-sm text-muted-foreground">
      <strong className="text-foreground">Demo preview.</strong> Connect a Supabase project to see
      live data and enable saving, posting, and moderation.
    </div>
  );
}
