import { Lock } from "lucide-react";
import { getT } from "@/i18n/server";

/** What Part C adds (sealed quote box, council summary, award publishing): "coming soon", one line each. */
export function PartCComingSoon() {
  const t = getT("townJobs").partC;
  return (
    <section className="rounded-xl border border-dashed border-border bg-card/60 p-5" data-part="c">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Lock className="size-4 text-muted-foreground" /> {t.title}
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {t.items.map((x) => (
          <li key={x.title}>
            <b>{x.title}.</b> <span className="text-muted-foreground">{x.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
