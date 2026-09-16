"use client";

import { useActionState } from "react";
import { resendConfirmationAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/auth/actions";

/**
 * Resend-confirmation control for /check-email. Email comes from the signup
 * redirect (?email=), so this is a one-tap "didn't get it? resend" — no retyping.
 */
export function ResendConfirmation({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(
    resendConfirmationAction,
    {} as ActionState,
  );

  if (state.success) {
    return (
      <p className="rounded-md bg-teal-100/60 px-3 py-2 text-sm font-medium text-teal-ink">
        {state.success}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <input
          name="email"
          type="email"
          required
          aria-label="Email address"
          placeholder="you@company.com"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Resend confirmation email"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
