import Link from "next/link";
import { HardHat } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { gcPostPath } from "@/lib/gc/packages";
import { cn } from "@/lib/utils";

/**
 * "Won this contract? Post your sub-trade packages free" — shown next to
 * public award notices, aimed at the winning contractor. The link carries
 * the award so their first package is prefilled.
 */
export function GcPackageCta({
  awardSlug,
  title = "Won this contract?",
}: {
  awardSlug: string | null;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-teal-300 bg-teal-50/60 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <HardHat className="size-4 text-teal-600" /> {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Post your sub-trade packages free and get quotes from local trades. One package per trade — subscribed
        trades in that trade and region get it in their morning email.
      </p>
      <Link href={gcPostPath(awardSlug)} className={cn(buttonVariants(), "mt-4 w-full")}>
        Post sub-trade packages — free
      </Link>
    </div>
  );
}
