import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/data/fomo";

/**
 * A tender's closing date, set like a procurement notice: the date first,
 * days left underneath in the last week. Deliberately calm, no flames or
 * coloured pills. `tone="dark"` for indigo surfaces.
 */
export function DeadlineStamp({
  deadline,
  tone = "light",
  className,
}: {
  deadline: string | null;
  tone?: "light" | "dark";
  className?: string;
}) {
  const days = daysUntil(deadline);
  const date = deadline
    ? new Date(`${deadline.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;
  const left = days === null || days < 0 || days > 7 ? null : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days left`;
  return (
    <span className={cn("shrink-0 text-right leading-tight tabular-nums", className)}>
      <span className={cn("block font-mono text-[10px] uppercase tracking-[0.12em]", tone === "dark" ? "text-indigo-100/60" : "text-muted-foreground")}>
        {date ? "Closes" : "Deadline"}
      </span>
      <span className={cn("block text-sm font-semibold", tone === "dark" ? "text-white" : "text-foreground")}>{date ?? "Open"}</span>
      {left && <span className={cn("block text-[11px]", tone === "dark" ? "text-teal-300" : "text-teal-700")}>{left}</span>}
    </span>
  );
}
