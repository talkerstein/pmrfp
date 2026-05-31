"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function go(
  endpoint: string,
  setBusy: (b: boolean) => void,
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
    toast.error(json.error ?? "Billing is not available right now.");
  } catch {
    toast.error("Something went wrong. Please try again.");
  } finally {
    setBusy(false);
  }
}

export function ActivateButton({
  label = "Activate Trade Pro",
  plan = "pro",
  interval = "annual",
  variant = "default",
  className,
}: {
  label?: string;
  plan?: "pro" | "featured";
  interval?: "monthly" | "annual";
  variant?: "default" | "outline" | "accent";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      variant={variant}
      disabled={busy}
      className={className}
      onClick={() => go("/api/stripe/checkout", setBusy, { plan, interval })}
    >
      {busy ? "Redirecting…" : label}
    </Button>
  );
}

export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={() => go("/api/stripe/portal", setBusy)}>
      {busy ? "Opening…" : "Manage billing"}
    </Button>
  );
}
