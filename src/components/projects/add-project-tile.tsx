"use client";

import { useEffect, useState } from "react";
import { isProfileMemberAction } from "@/lib/projects/profile-actions";

/**
 * "Add a project" on a company profile, for that company's own members
 * only. The profile is cached for everyone, so the tile isn't in its HTML:
 * it appears after the server confirms the viewer is a member.
 */
export function AddProjectTile({
  organizationId,
  href,
  title,
  body,
}: {
  organizationId: string;
  href: string;
  title: string;
  body: string;
}) {
  const [member, setMember] = useState(false);

  useEffect(() => {
    let live = true;
    isProfileMemberAction(organizationId)
      .then((ok) => live && setMember(ok))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [organizationId]);

  if (!member) return null;
  return (
    <a className="add lift" href={href}>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#91F2CF" strokeWidth="3" style={{ alignSelf: "flex-end" }} aria-hidden>
        <path d="M15 5v20M5 15h20" />
      </svg>
      <span>
        <span className="t">{title}</span>
        <span className="s">{body}</span>
      </span>
    </a>
  );
}
