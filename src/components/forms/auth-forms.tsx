"use client";

import Link from "@/i18n/link";
import { useActionState, useState } from "react";
import { Building2, Hammer, HardHat, KeyRound, Package, Search, Home, UserRound } from "lucide-react";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type ActionState,
} from "@/lib/auth/actions";
import { onboardingPath, parseRoleChoice } from "@/lib/auth/oauth";
import { ContinueWithGoogle } from "@/components/forms/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/i18n/provider";

const initial: ActionState = {};

function Alert({ state }: { state: ActionState }) {
  if (state.error)
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.success)
    return <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.success}</p>;
  return null;
}

/** Tells the server action which language to answer in and redirect to. */
function LangField() {
  const lang = useLang();
  return <input type="hidden" name="lang" value={lang} />;
}

export function SignInForm({ next }: { next?: string | null }) {
  const t = useT("auth").forms;
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <LangField />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t.password}</Label>
          <Link href="/forgot-password" className="text-xs text-teal-700 hover:underline">
            {t.forgot}
          </Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.signingIn : t.signIn}
      </Button>
    </form>
  );
}

// Prestige-tone role picker. Industry-native labels — these are how
// people in each role describe themselves to peers, not how a SaaS sells
// them. Order: most common to least. Labels and hints live in messages/auth.
const ROLES = [
  { value: "trade", icon: HardHat },
  { value: "supplier", icon: Package },
  { value: "property_manager", icon: Building2 },
  { value: "landlord", icon: KeyRound },
  { value: "general_contractor", icon: Hammer },
  { value: "real_estate_agent", icon: Home },
  { value: "talent", icon: UserRound },
  { value: "visitor", icon: Search },
] as const;

export function SignUpForm({
  initialRole,
  next,
  lockRole = false,
  award,
  google = false,
}: {
  initialRole?: "trade" | "supplier" | "property_manager" | "visitor" | "real_estate_agent" | "general_contractor" | "landlord" | "talent";
  next?: string | null;
  /** Arrived from a paid-plan button: the role is decided, so don't show the picker. */
  lockRole?: boolean;
  /** Award notice a GC came from — prefills their first sub-trade package. */
  award?: string | null;
  /** Show "Continue with Google" (only when it's switched on in Supabase). */
  google?: boolean;
}) {
  const t = useT("auth").forms;
  const [state, action, pending] = useActionState(signUpAction, initial);
  const [role, setRole] = useState<string>(initialRole ?? "trade");
  // A GC is a buyer (same posting rights as a property manager) whose
  // organization is a 'builder'; the org type is set at onboarding.
  const isGc = role === "general_contractor";
  // A landlord is the same kind of buyer with a 'landlord' organization.
  const isLandlord = role === "landlord";
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <LangField />
      <input type="hidden" name="role" value={isGc || isLandlord ? "property_manager" : role} />
      {isGc && <input type="hidden" name="orgKind" value="builder" />}
      {isLandlord && <input type="hidden" name="orgKind" value="landlord" />}
      {isGc && award && <input type="hidden" name="award" value={award} />}
      {next && <input type="hidden" name="next" value={next} />}
      {!lockRole && (
      <div className="space-y-2">
        <Label>{t.iAm}</Label>
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
                <span className="block text-sm font-medium">{t.roles[r.value].label}</span>
                <span className="block text-xs text-muted-foreground">{t.roles[r.value].hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      )}
      {google && role !== "talent" && (
        // The role rides to onboarding, where it's asked again (pre-selected) before anything is saved.
        <ContinueWithGoogle next={onboardingPath({ role: parseRoleChoice(role), award, next })} />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="fullName">{t.fullName}</Label>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t.password}</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.creating : t.createAccount}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useT("auth").forms;
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <LangField />
      <div className="space-y-1.5">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.sending : t.sendReset}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useT("auth").forms;
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <LangField />
      <div className="space-y-1.5">
        <Label htmlFor="password">{t.newPassword}</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">{t.confirmPassword}</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.updating : t.updatePassword}
      </Button>
    </form>
  );
}
