import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
  as: Tag = "div",
  size = "default",
}: {
  className?: string;
  children: React.ReactNode;
  as?: keyof React.JSX.IntrinsicElements;
  size?: "default" | "narrow" | "wide";
}) {
  const sizes = {
    narrow: "max-w-4xl",
    default: "max-w-6xl",
    wide: "max-w-7xl",
  } as const;
  return (
    <Tag className={cn("mx-auto w-full px-5 sm:px-8", sizes[size], className)}>
      {children}
    </Tag>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("eyebrow inline-flex items-center gap-2 text-gold-600", className)}>
      <span className="size-1.5 rounded-full bg-gold-500" />
      {children}
    </span>
  );
}
