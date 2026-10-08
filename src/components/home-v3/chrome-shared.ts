/** Server-safe pieces of the v3 chrome (types, hrefs, copy slicing). */
import type { Messages } from "@/i18n/dictionaries";

export type V3Messages = Messages["homeV3"];
/** Only the chrome's slice of the homepage copy (keeps client payloads small). */
export type V3ChromeMessages = Pick<V3Messages, "skip" | "founding" | "nav" | "footer">;

export const chromeMessages = (t: V3Messages): V3ChromeMessages => ({ skip: t.skip, founding: t.founding, nav: t.nav, footer: t.footer });

export const V3_MARK = "/brand/mark-white.svg";

/** Hrefs used by the chrome (localized at render). */
export const V3H = {
  home: "/",
  founding: "/founding-500",
  rfps: "/rfps",
  directory: "/directory",
  winners: "/contract-winners",
  jobs: "/jobs",
  forum: "/forum",
  pricing: "/pricing",
  marketplace: "/marketplace",
  signIn: "/sign-in",
  joinTrade: "/sign-up?role=trade",
  landlord: "/sign-up?role=landlord",
  forRealEstate: "/for/real-estate",
  advertise: "/advertise",
};

