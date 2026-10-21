"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";

type Msgs = { unavailable: string; failed: string };

async function go(
  endpoint: string,
  setBusy: (b: boolean) => void,
  msgs: Msgs,
  body?: Record<string, unknown>,
) {
  setBusy(true);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (json.url) {
      window.location.href = json.url;
      return;
    }
    toast.error(json.error ?? msgs.unavailable);
  } catch {
    toast.error(msgs.failed);
  } finally {
    setBusy(false);
  }
}

export function ActivateButton({
  label,
  plan = "pro",
  interval = "annual",
  variant = "default",
  className,
}: {
  label?: string;
  plan?: "seo" | "pro" | "featured" | "realtor";
  interval?: "monthly" | "annual";
  variant?: "default" | "outline" | "accent";
  className?: string;
}) {
  const t = useT("dashClient").billing;
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      variant={variant}
      disabled={busy}
      className={className}
      data-track="upgrade_clicked"
      data-plan={plan}
      data-where="billing"
      onClick={() => go("/api/stripe/checkout", setBusy, t, { plan, interval })}
    >
      {busy ? t.redirecting : (label ?? t.activate)}
    </Button>
  );
}

export function ManageBillingButton() {
  const t = useT("dashClient").billing;
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={() => go("/api/stripe/portal", setBusy, t)}>
      {busy ? t.opening : t.manage}
    </Button>
  );
}
