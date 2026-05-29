import { ShieldAlert } from "lucide-react";
import { COPY } from "@/lib/site";
import { cn } from "@/lib/utils";

export function TrustDisclaimer({ text, className }: { text?: string; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border border-border bg-secondary/40 p-4", className)}>
      <ShieldAlert className="size-5 shrink-0 text-gold-600" />
      <p className="text-xs leading-relaxed text-muted-foreground">{text ?? COPY.disclaimer}</p>
    </div>
  );
}
