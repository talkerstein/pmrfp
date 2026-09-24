"use client";

import { useActionState } from "react";
import { Building2, Hammer, HardHat, Package } from "lucide-react";
import { chooseRoleAction, type ActionState } from "@/lib/auth/actions";
import type { RoleChoice } from "@/lib/auth/oauth";
import { Button } from "@/components/ui/button";

const OPTIONS: { value: RoleChoice; label: string; hint: string; icon: typeof HardHat }[] = [
  { value: "trade", label: "I'm a trade / contractor", hint: "Get listed and see RFPs in your trade", icon: HardHat },
  { value: "property_manager", label: "I manage property", hint: "Post RFPs for your buildings, free", icon: Building2 },
  { value: "general_contractor", label: "I'm a general contractor hiring subs", hint: "Post sub-trade packages, free", icon: Hammer },
  { value: "supplier", label: "I'm a supplier", hint: "Reach the trades and buyers who need what you sell", icon: Package },
];

/**
 * One question for people who signed up with Google: which kind of account.
 * Pre-selected from the sign-up page when we know; saved by chooseRoleAction.
 */
export function RolePickerForm({
  initial,
  next,
  award,
}: {
  initial?: RoleChoice | null;
  next?: string | null;
  award?: string | null;
}) {
  const [state, action, pending] = useActionState(chooseRoleAction, {} as ActionState);
  return (
    <form action={action} className="space-y-6">
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {next && <input type="hidden" name="next" value={next} />}
      {award && <input type="hidden" name="award" value={award} />}
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Account type</legend>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"
          >
            <input
              type="radio"
              name="role"
              value={o.value}
              required
              defaultChecked={initial === o.value}
              className="mt-0.5 size-4"
            />
            <o.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
