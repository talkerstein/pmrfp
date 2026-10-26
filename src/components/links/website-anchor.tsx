import type { ReactNode } from "react";
import type { WebsiteLink } from "@/lib/links/policy";

/**
 * The one anchor for a member's own website (lib/links/policy). Earned links
 * point straight at the site with a normal rel; everything else goes through
 * /out/<slug> (which counts the visit) with rel="nofollow ugc". Use this, not
 * a bare <a href={website}>, anywhere a member-supplied address is printed.
 */
export function WebsiteAnchor({ link, className, children }: { link: WebsiteLink; className?: string; children?: ReactNode }) {
  return (
    <a href={link.href} target="_blank" rel={link.rel} className={className} data-link="website" data-earned={link.earned ? "1" : "0"}>
      {children ?? link.label}
    </a>
  );
}
