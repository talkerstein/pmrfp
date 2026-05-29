import Link from "next/link";
import { DynamicIcon } from "@/components/public/dynamic-icon";

export function CategoryGrid({
  categories,
  limit,
}: {
  categories: { slug: string; name: string; icon: string | null }[];
  limit?: number;
}) {
  const items = limit ? categories.slice(0, limit) : categories;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((c) => (
        <Link
          key={c.slug}
          href={`/directory?category=${c.slug}`}
          className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-gold-400 hover:bg-secondary/40"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-gold-600 group-hover:bg-gold-100">
            <DynamicIcon name={c.icon} className="size-5" />
          </span>
          <span className="text-sm font-medium text-foreground">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}
