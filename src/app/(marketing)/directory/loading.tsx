import { Container } from "@/components/container";

/** Skeleton matching the redesigned directory: indigo hero, command bar, featured marquee, ledger rows. */
export default function DirectoryLoading() {
  return (
    <>
      <section className="bg-indigo">
        <Container className="grid items-end gap-10 pb-20 pt-12 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="h-3 w-32 animate-pulse rounded bg-white/15" />
            <div className="mt-5 h-12 w-2/3 max-w-md animate-pulse rounded-md bg-white/15" />
            <div className="mt-5 h-4 w-full max-w-lg animate-pulse rounded bg-white/10" />
          </div>
          <div className="flex gap-7 pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 w-16 animate-pulse rounded bg-white/10" />
            ))}
          </div>
        </Container>
      </section>

      <Container className="relative z-20 -mt-10">
        <div className="h-20 animate-pulse rounded-2xl border border-border bg-white shadow-lg" />
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-secondary" />
          ))}
        </div>
      </Container>

      <Container className="pt-9">
        <div className="h-3 w-44 animate-pulse rounded bg-secondary" />
        <div className="mt-4 grid items-stretch gap-3.5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_232px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[252px] animate-pulse rounded-2xl bg-indigo/85" />
          ))}
          <div className="h-[252px] animate-pulse rounded-2xl border-[1.5px] border-dashed border-border-strong bg-secondary/40" />
        </div>
      </Container>

      <Container className="pb-16 pt-8">
        <div className="h-3 w-44 animate-pulse rounded bg-secondary" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
          <div className="h-9 border-b border-border bg-secondary/60" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
              <div className="size-[38px] shrink-0 animate-pulse rounded-[10px] bg-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
