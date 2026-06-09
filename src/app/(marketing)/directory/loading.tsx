import { Container, Eyebrow } from "@/components/container";

/** Skeleton shown while the directory data loads, so navigation feels instant. */
export default function DirectoryLoading() {
  return (
    <>
      <section className="border-b border-border bg-secondary/30">
        <Container className="py-12">
          <Eyebrow>Vendor directory</Eyebrow>
          <div className="mt-3 h-9 w-2/3 max-w-xl animate-pulse rounded-md bg-secondary" />
          <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded bg-secondary" />
          <div className="mt-6 h-20 animate-pulse rounded-xl border border-teal-200 bg-teal-50/60" />
        </Container>
      </section>

      <Container className="py-8">
        <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        <div className="mt-6 h-4 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <div className="size-11 shrink-0 animate-pulse rounded-md bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full animate-pulse rounded bg-secondary" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-secondary" />
              <div className="mt-4 flex gap-1.5">
                <div className="h-5 w-16 animate-pulse rounded-full bg-secondary" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
