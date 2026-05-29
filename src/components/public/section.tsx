import Link from "next/link";
import { Container, Eyebrow } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  containerSize = "default",
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  containerSize?: "default" | "narrow" | "wide";
  tone?: "default" | "muted" | "indigo";
}) {
  const tones = {
    default: "bg-background",
    muted: "bg-secondary/40",
    indigo: "bg-indigo text-white",
  };
  return (
    <section className={cn(tones[tone], className)}>
      <Container size={containerSize} className="py-16 sm:py-20">
        {children}
      </Container>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function CTASection({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="border-t border-border bg-indigo text-white">
      <Container className="flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
          {description && <p className="mt-2 max-w-xl text-indigo-100/70">{description}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={primaryHref} className={buttonVariants({ size: "lg", variant: "accent" })}>
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel && (
            <Link
              href={secondaryHref}
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white",
              )}
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      </Container>
    </section>
  );
}
