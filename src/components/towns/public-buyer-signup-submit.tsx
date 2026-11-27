"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { StagingTurnstile } from "@/components/forms/staging-turnstile";
import { accountSignupTurnstileAction } from "@/lib/d1/staging-turnstile";

export function PublicBuyerSignupSubmit({ label, siteKey }: { label: string; siteKey: string }) {
  const [token, setToken] = useState("");
  const [attempt] = useState(() => ({}));
  const { pending } = useFormStatus();
  return <>
    <StagingTurnstile siteKey={siteKey} attempt={attempt} onToken={setToken} action={accountSignupTurnstileAction} />
    <input type="hidden" name="cf-turnstile-response" value={token} />
    <button type="submit" className="v3-su-go" style={{ marginTop: 14 }} disabled={!token || pending}>{label}</button>
  </>;
}
