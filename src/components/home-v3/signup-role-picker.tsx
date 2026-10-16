"use client";

import { useId, useState } from "react";
import type { Messages } from "@/i18n/dictionaries";
import { SmallTick } from "./signup-ui";

type SignupRoleCopy = Messages["v3Pages"]["signup"] & { linkNote?: string };

/**
 * The sign-up page's first question, in two steps: three big cards (do the
 * work / hire contractors / looking for a job), then, for the first two, which
 * kind. "Just looking" (visitor) is a small text link under the cards on
 * purpose: business owners read "browsing the directory" as "get into the
 * directory", picked it, and never got listed. Role values are unchanged.
 */
export const ROLE_GROUPS = {
  work: ["trade", "supplier"],
  hire: ["property_manager", "landlord", "general_contractor", "real_estate_agent"],
  talent: ["talent"],
} as const;
export type RoleGroup = keyof typeof ROLE_GROUPS;
export const GROUP_ORDER: RoleGroup[] = ["work", "hire", "talent"];
export type PickerRole = (typeof ROLE_GROUPS)[RoleGroup][number] | "visitor";

/** Which big card a role sits under (visitor: none). */
export function groupOf(role: string): RoleGroup | null {
  for (const g of GROUP_ORDER) if ((ROLE_GROUPS[g] as readonly string[]).includes(role)) return g;
  return null;
}

/** Picking a card: the role it starts on. "I do the work" starts on trade (most of them). */
export function roleForGroup(g: RoleGroup, current: string): PickerRole | "" {
  if (groupOf(current) === g) return current as PickerRole;
  return g === "work" ? "trade" : g === "talent" ? "talent" : "";
}

const GROUP_ICON: Record<RoleGroup, string> = {
  work: "M14.7 6.3a4 4 0 00-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 005.2-5.4l-2.6 2.6-2.1-.7-.7-2.1z",
  hire: "M4 21V5l8-2v18M12 9l8 2v10M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2",
  talent: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5",
};

export function SignupRolePicker({
  t,
  role,
  onRole,
  onLooking,
}: {
  t: SignupRoleCopy;
  role: PickerRole | "";
  onRole: (r: PickerRole | "") => void;
  /** "Just looking": sets visitor and moves on. */
  onLooking: () => void;
}) {
  // A card picked before its sub-choice (hire): remembered here until a role is chosen.
  const [pending, setPending] = useState<RoleGroup | null>(null);
  const shown = groupOf(role) ?? pending;
  const subId = useId();
  const pick = (g: RoleGroup) => {
    setPending(g);
    onRole(roleForGroup(g, role));
  };
  const subs = shown && ROLE_GROUPS[shown].length > 1 ? (ROLE_GROUPS[shown] as readonly PickerRole[]) : null;

  return (
    <>
      <div role="radiogroup" aria-label={t.iAm} className="v3-su-roles v3-su-groups">
        {GROUP_ORDER.map((g) => (
          <button key={g} type="button" role="radio" aria-checked={shown === g} className="v3-su-role v3-su-group" data-group={g} onClick={() => pick(g)}>
            <span className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={GROUP_ICON[g]} /></svg></span>
            <span className="tx"><span className="nm">{t.groups[g].name}</span><span className="ds">{t.groups[g].desc}</span></span>
            <span className="tk"><SmallTick stroke="#FFFFFF" /></span>
          </button>
        ))}
      </div>

      {subs && shown && shown !== "talent" && (
        <div className="v3-su-subs-wrap">
          <div className="v3-su-subhd" id={subId}>{t.groupHead[shown]}</div>
          <div role="radiogroup" aria-labelledby={subId} className="v3-su-subs">
            {subs.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className="v3-su-opt" data-role={r} onClick={() => onRole(r)}>
                <span className="tk"><SmallTick stroke="#FFFFFF" size={10} /></span>
                <span className="tx">
                  <span className="nm">{t.roles[r].name}</span>
                  <span className="ds">{t.roles[r].desc}{r === "trade" || r === "supplier" ? (t.linkNote ? <><br />✓ {t.linkNote}</> : null) : null}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="v3-su-look">
        <button type="button" className="v3-su-lookbtn" data-role="visitor" aria-pressed={role === "visitor"} onClick={onLooking}>
          {t.looking}
        </button>
      </p>
    </>
  );
}
