import type { SessionContext } from "@/lib/access/access";

/**
 * Is the signed-in viewer a member of the company whose profile this is?
 * (pure, tested). session.organization comes from organization_members, so
 * a match IS membership. A suspended account or company is nobody's member.
 */
export function isProfileMember(
  session: Pick<SessionContext, "profile" | "organization"> | null,
  profileOrganizationId: string,
): boolean {
  if (!session?.organization || !profileOrganizationId) return false;
  if (session.profile.status === "suspended" || session.organization.status === "suspended") return false;
  return session.organization.id === profileOrganizationId;
}
