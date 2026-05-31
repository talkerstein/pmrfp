"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { MAIN_NAV, REFERRAL } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors",
        scrolled
          ? "border-b border-border bg-background/90 backdrop-blur"
          : "border-b border-transparent",
      )}
    >
      <Container className="flex h-[72px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="PMRFP home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-2/80 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/refer-a-project"
            className="hidden xl:inline-flex items-center gap-1 rounded-full border border-teal-300/70 bg-teal-100/40 px-3 py-1.5 text-xs font-semibold text-teal-ink transition-colors hover:bg-teal-100/70"
            title={`${REFERRAL.shortCta} — earn $${REFERRAL.fee} when work is awarded`}
          >
            <span className="size-1.5 rounded-full bg-teal-ink" />
            {REFERRAL.shortCta} · ${REFERRAL.fee}
          </Link>
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign In
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
            Join PMRFP
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-secondary lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </Container>

      {open && (
        <div className="fixed inset-x-0 top-[72px] z-50 border-t border-border bg-background lg:hidden">
          <div className="space-y-1 px-5 py-6">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-4 grid gap-2 border-t border-border pt-4">
              <Link
                href="/refer-a-project"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-full border border-teal-300/70 bg-teal-100/40 px-4 py-2.5 text-sm font-semibold text-teal-ink"
              >
                <span className="size-1.5 rounded-full bg-teal-ink" />
                {REFERRAL.shortCta} · earn ${REFERRAL.fee}
              </Link>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants(), "w-full")}
              >
                Join PMRFP
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
