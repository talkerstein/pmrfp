"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useLang, useT } from "@/i18n/provider";
import { localizePath } from "@/i18n/config";
import { requestJoinAction } from "@/lib/dedupe/actions";
import type { DuplicateCompanyView } from "@/lib/auth/actions";

/**
 * Onboarding: "This company may already be on PMRFP". Shown instead of the
 * form when the company being created matches an existing listing. Either
 * ask to join that company, or confirm it's a different one (the same
 * submission again, plus dup_ack, so the listing is created and flagged for
 * an admin to double-check). Never merges anything.
 */
export function DuplicateCompanyPanel({
  matches,
  echo,
  action,
  pending,
  onEdit,
}: {
  matches: DuplicateCompanyView[];
  echo: [string, string][];
  action: (formData: FormData) => void;
  pending: boolean;
  onEdit: () => void;
}) {
  const t = useT("dedupeClient").match;
  const lang = useLang();

  return (
    <div className="space-y-5" role="region" aria-labelledby="dup-heading">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 id="dup-heading" className="text-base font-semibold text-amber-950">{t.heading}</h2>
        <p className="mt-1 text-sm text-amber-900">{t.intro}</p>
      </div>

      <ul className="space-y-3">
        {matches.map((m) => (
          <li key={m.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{m.name}</p>
                {(m.city || m.province) && (
                  <p className="text-sm text-muted-foreground">{[m.city, m.province].filter(Boolean).join(", ")}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.oneOf} {m.reasons.map((r) => t.reasons[r]).join(" · ")}
                </p>
              </div>
              {m.listed && (
                <a
                  href={localizePath(`/directory/${m.slug}`, lang)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-teal-700 hover:underline"
                >
                  {t.viewListing}
                </a>
              )}
            </div>
            <form action={requestJoinAction} className="mt-3">
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="orgId" value={m.id} />
              {m.reasons.map((r) => (
                <input key={r} type="hidden" name="reason" value={r} />
              ))}
              <JoinButton label={t.requestJoin} sending={t.sending} />
            </form>
          </li>
        ))}
      </ul>

      <form action={action} className="rounded-lg border border-dashed border-border p-4">
        {echo.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}
        {matches.map((m) => (
          <input key={m.id} type="hidden" name="dup_ack" value={m.id} />
        ))}
        <p className="mb-3 text-sm text-muted-foreground">{t.differentHint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t.sending : t.different}
          </Button>
          <button type="button" onClick={onEdit} className="text-sm text-muted-foreground underline">
            {t.edit}
          </button>
        </div>
      </form>
    </div>
  );
}

function JoinButton({ label, sending }: { label: string; sending: string }) {
  // requestJoinAction redirects back to onboarding, which shows the pending request.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? sending : label}
    </Button>
  );
}
