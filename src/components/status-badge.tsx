import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  // greens
  approved: "bg-green-100 text-green-800",
  published: "bg-green-100 text-green-800",
  active: "bg-green-100 text-green-800",
  comped: "bg-green-100 text-green-800",
  paid: "bg-green-100 text-green-800",
  shortlisted: "bg-green-100 text-green-800",
  contact_revealed: "bg-green-100 text-green-800",
  // ambers
  pending_review: "bg-amber-100 text-amber-800",
  draft: "bg-amber-100 text-amber-800",
  submitted: "bg-amber-100 text-amber-800",
  viewed: "bg-amber-100 text-amber-800",
  trialing: "bg-amber-100 text-amber-800",
  past_due: "bg-amber-100 text-amber-800",
  new: "bg-amber-100 text-amber-800",
  // reds
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-red-100 text-red-800",
  declined: "bg-red-100 text-red-800",
  canceled: "bg-red-100 text-red-800",
  unpaid: "bg-red-100 text-red-800",
  spam: "bg-red-100 text-red-800",
  // neutrals
  closed: "bg-slate-200 text-slate-700",
  archived: "bg-slate-200 text-slate-700",
  awarded: "bg-blue-100 text-blue-800",
  inactive: "bg-slate-200 text-slate-700",
  contacted: "bg-blue-100 text-blue-800",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <Badge
      className={cn(
        "border-transparent font-medium capitalize hover:bg-current/0",
        TONE[status] ?? "bg-slate-200 text-slate-700",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
