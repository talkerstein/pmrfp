"use client";

import { useActionState, useState } from "react";
import { upgradeVisitorAction } from "@/lib/auth/visitor-upgrade-actions";
import type { ActionState } from "@/lib/auth/actions";
import type { BusinessRole } from "@/lib/auth/visitor-upgrade";
import { SmallTick } from "@/components/home-v3/signup-ui";
import { localizePath } from "@/i18n/config";
import { useLang, useT } from "@/i18n/provider";

/**
 * "Run a business? List it free in 2 minutes." for a "just looking" account:
 * pick trade or supplier (and, optionally, the company name), then company
 * onboarding. Saved by upgradeVisitorAction.
 */
export function VisitorUpgradeForm({
  roles,
}: {
  /** Labels for the two business roles, from the sign-up page's copy. */
  roles: Record<BusinessRole, { name: string; desc: string }>;
}) {
  const t = useT("auth").visitorUpgrade;
  const lang = useLang();
  const [state, action, pending] = useActionState(upgradeVisitorAction, {} as ActionState);
  const [role, setRole] = useState<BusinessRole>("trade");
  return (
    <form action={action}>
      {state.error && <div role="alert" className="v3-su-err" style={{ margin: "0 0 16px" }}>{state.error}</div>}
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="role" value={role} />
      <div className="v3-su-subhd" id="vu-legend">{t.legend}</div>
      <div role="radiogroup" aria-labelledby="vu-legend" className="v3-su-subs">
        {(["trade", "supplier"] as const).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} className="v3-su-opt" onClick={() => setRole(r)}>
            <span className="tk"><SmallTick stroke="#FFFFFF" size={10} /></span>
            <span className="tx"><span className="nm">{roles[r].name}</span><span className="ds">{roles[r].desc}</span></span>
          </button>
        ))}
      </div>
      <div className="v3-su-two">
        <label className="v3-su-fld"><span>{t.company}</span><input name="company" autoComplete="organization" maxLength={120} /></label>
      </div>
      <div className="v3-su-note">{t.companyHint}</div>
      <div className="v3-su-biz-foot">
        <button type="submit" className="v3-su-go" disabled={pending}>{pending ? t.saving : t.submit}</button>
        <a href={localizePath("/directory", lang)} className="v3-su-lookbtn">{t.keep}</a>
      </div>
    </form>
  );
}
