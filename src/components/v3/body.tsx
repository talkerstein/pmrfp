import type { ReactNode } from "react";
import { V3Sticky } from "@/components/home-v3/chrome";
import { getLang, getT } from "@/i18n/server";
import { loadV3Board } from "./data";

/**
 * Body scope for the audience-landing, simple-page and forum templates: their
 * styles live under .v3p (components/v3-pages/landing.css), and they end with the live
 * sticky board bar. The (v3) layout supplies the shared chrome around this.
 */
export async function V3Body({ children }: { children: ReactNode }) {
  const lang = getLang();
  const board = await loadV3Board();
  const h = getT("homeV3");
  return (
    <>
      <div className="v3p">{children}</div>
      <V3Sticky t={{ sticky: h.sticky, nav: h.nav }} lang={lang} open={board.open} closing7={board.closing7} />
    </>
  );
}
