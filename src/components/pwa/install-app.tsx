"use client";

import { useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  captureInstallPrompt,
  dismissInstall,
  getInstallMode,
  getServerInstallMode,
  promptInstall,
  subscribeInstall,
} from "@/components/pwa/install-prompt";
import { cn } from "@/lib/utils";

captureInstallPrompt();

export type InstallAudience = "trade" | "pm" | "other";

const PITCH: Record<InstallAudience, string> = {
  trade: "New RFPs that match your trade, one tap away on your home screen. Opens full-screen, like any app.",
  pm: "Your RFPs and the trades bidding on them, one tap away on your home screen. Opens full-screen, like any app.",
  other: "PMRFP one tap away on your home screen. Opens full-screen, like any app.",
};

/**
 * "Install the PMRFP app" card. One tap on Chrome / Edge / Samsung Internet;
 * Share → Add to Home Screen steps on iPhone and iPad Safari. Renders nothing
 * once installed, when already running as the app, where the browser can't
 * install, or for 30 days after "Not now".
 *
 * `sidebar` sits in the indigo dashboard sidebar; `banner` is the light card
 * shown above the page content on phones.
 */
export function InstallApp({
  variant,
  audience,
  className,
}: {
  variant: "sidebar" | "banner";
  audience: InstallAudience;
  className?: string;
}) {
  const mode = useSyncExternalStore(subscribeInstall, getInstallMode, getServerInstallMode);
  if (mode === "hidden") return null;

  const dark = variant === "sidebar";
  const action =
    mode === "prompt" ? (
      <Button
        variant={dark ? "accent" : "default"}
        size="sm"
        className={cn("mt-3", dark && "w-full")}
        onClick={() => void promptInstall()}
      >
        <Download className="size-3.5" />
        Install app
      </Button>
    ) : (
      <p className={cn("mt-2 text-xs leading-relaxed", dark ? "text-sidebar-accent-foreground" : "text-foreground")}>
        Tap <Share className="inline size-3.5 -translate-y-px" aria-hidden /> <strong>Share</strong>, then{" "}
        <strong>Add to Home Screen</strong> <SquarePlus className="inline size-3.5 -translate-y-px" aria-hidden />
      </p>
    );

  return (
    <section
      aria-label="Install the PMRFP app"
      className={cn(
        "relative rounded-xl border p-3.5",
        dark ? "border-sidebar-border bg-sidebar-accent" : "flex items-start gap-3 border-border bg-card shadow-sm",
        className,
      )}
    >
      {!dark && <LogoMark className="size-10 shrink-0 text-indigo" />}
      <div className="min-w-0 flex-1 pr-6">
        <p className={cn("text-sm font-semibold", dark ? "text-white" : "text-foreground")}>
          Install the PMRFP app
        </p>
        <p className={cn("mt-1 text-xs leading-relaxed", dark ? "text-sidebar-foreground" : "text-muted-foreground")}>
          {PITCH[audience]}
        </p>
        {action}
      </div>
      <button
        type="button"
        onClick={dismissInstall}
        aria-label="Not now"
        title="Not now"
        className={cn(
          "absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full transition-colors",
          dark
            ? "text-sidebar-foreground hover:bg-sidebar hover:text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
