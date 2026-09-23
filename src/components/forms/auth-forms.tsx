"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Building2, HardHat, Package, Search, Home } from "lucide-react";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type ActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initial: ActionState = {};

function Alert({ state }: { state: ActionState }) {
  if (state.error)
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.success)
    return <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.success}</p>;
  return null;
}

export function SignInForm({ next }: { next?: string | null }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-teal-700 hover:underline">
            Forgot?
          </Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

// Prestige-tone role picker. Industry-native labels — these are how
// people in each role describe themselves to peers, not how a SaaS sells
// them. Order: most common to least.
const ROLES = [
  { value: "trade", label: "Trade or service company", icon: HardHat, hint: "Get listed in the directory and access live RFP opportunities" },
  { value: "supplier", label: "Supplier or distributor", icon: Package, hint: "Reach the trades, builders, and property managers who buy what you sell" },
  { value: "property_manager", label: "Property manager, owner, or builder", icon: Building2, hint: "Post RFPs for your properties; browse and shortlist trades" },
  { value: "real_estate_agent", label: "Real estate professional", icon: Home, hint: "Post pre-listing repairs, turnovers, or portfolio work for your clients" },
  { value: "visitor", label: "Browsing the directory", icon: Search, hint: "Look around — you can join later" },
] as const;

export function SignUpForm({
  initialRole,
  next,
  lockRole = false,
}: {
  initialRole?: "trade" | "supplier" | "property_manager" | "visitor" | "real_estate_agent";
  next?: string | null;
  /** Arrived from a paid-plan button: the role is decided, so don't show the picker. */
  lockRole?: boolean;
}) {
  const [state, action, pending] = useActionState(signUpAction, initial);
  const [role, setRole] = useState<string>(initialRole ?? "trade");
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <input type="hidden" name="role" value={role} />
      {next && <input type="hidden" name="next" value={next} />}
      {!lockRole && (
      <div className="space-y-2">
        <Label>I am…</Label>
        <div className="grid gap-2">
          {ROLES.map((r) => (
            <button
              type="button"
              key={r.value}
              onClick={() => setRole(r.value)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                role === r.value ? "border-teal-500 bg-teal-50" : "border-border hover:bg-secondary",
              )}
            >
              <r.icon className={cn("size-5", role === r.value ? "text-teal-600" : "text-muted-foreground")} />
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Your name</Label>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
