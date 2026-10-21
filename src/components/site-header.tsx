"use client";

import Link from "@/i18n/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { MAIN_NAV } from "@/lib/site";
import { useLang, useT } from "@/i18n/provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LanguageBanner } from "@/components/language-banner";
import { MarketSwitcher } from "@/components/geo/market-switcher";

const NAV_KEY = {
  "/rfps": "rfps",
  "/directory": "directory",
  "/jobs": "jobs",
  "/forum": "forum",
  "/marketplace": "marketplace",
  "/for-property-managers": "forPms",
  "/rfp-writer": "writer",
  "/pricing": "pricing",
} as const;
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const t = useT("common").nav;
  // French and Spanish labels run longer: keep the burger menu up to 2xl so the desktop row never overflows.
  const en = useLang() === "en";
  // English too since the free RFP writer joined the nav (persona QA 2026-10-21): at xl it overflowed.
  const bp = en
    ? { show: "2xl:flex", hide: "2xl:hidden", pad: "" }
    : { show: "min-[1700px]:flex", hide: "min-[1700px]:hidden", pad: "" };
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
        <Link href="/" className="flex items-center gap-2" aria-label={t.home}>
          <Logo />
        </Link>

        <nav className={cn("hidden items-center gap-1", bp.show)}>
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium text-ink-2/80 transition-colors hover:bg-secondary hover:text-foreground", bp.pad)}
            >
              {t[NAV_KEY[item.href]]}
            </Link>
          ))}
        </nav>

        <div className={cn("hidden items-center gap-2", bp.show)}>
          <MarketSwitcher />
          <LanguageSwitcher />
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t.signIn}
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
            {t.join}
          </Link>
        </div>

        <button
          type="button"
          aria-label={t.toggleMenu}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn("inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-secondary", bp.hide)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </Container>
      {!open && <LanguageBanner variant="site" />}

      {open && (
        <div className={cn("fixed inset-x-0 top-[72px] z-50 border-t border-border bg-background", bp.hide)}>
          <div className="space-y-1 px-5 py-6">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-secondary"
              >
                {t[NAV_KEY[item.href]]}
              </Link>
            ))}
            <div className="mt-4 grid gap-2 border-t border-border pt-4">
              <div className="flex gap-2">
                <MarketSwitcher />
                <LanguageSwitcher />
              </div>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              >
                {t.signIn}
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants(), "w-full")}
              >
                {t.join}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
