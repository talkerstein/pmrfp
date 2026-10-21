import type { V3Data } from "./home-v3";

/**
 * What the homepage starts from before live data fills it in, and what is
 * left of a block whose live query fails. It holds NO numbers and no sample
 * listings: a count we can't read is `null` and its stat block is hidden (or
 * says "Live numbers loading"), and an empty list hides its section. Never
 * put design-time figures back here: a made-up "534 open" or "$523M awarded"
 * shown as live data is a false claim.
 *
 * The trade tiles and filter options are navigation (names, photos, links),
 * not stats, so they stay; their counts are null.
 */
export const V3_FALLBACK: V3Data = {
  open: null,
  openPm: null,
  openPublic: null,
  closing7: null,
  trades: null,
  regions: null,
  foundingLeft: null,
  big: { name: "General Contracting", n: null, img: "/images/photos/site-crew-deck.webp", href: "/trades" },
  tiles: [
    { name: "Roofing", n: null, img: "/images/home/hero-roofing.webp", href: "/trades" },
    { name: "Snow Removal", n: null, img: "/images/home/trade-snow.webp", href: "/trades" },
    { name: "Cleaning / Janitorial", n: null, img: "/images/home/trade-cleaning.webp", href: "/trades" },
    { name: "HVAC", n: null, img: "/images/home/trade-hvac.webp", href: "/trades" },
    { name: "Electrical", n: null, img: "/images/home/trade-electrical.webp", href: "/trades" },
  ],
  chips: [],
  tradeOptions: ["Roofing", "Snow Removal", "HVAC", "Electrical", "Cleaning / Janitorial"].map((label) => ({ value: "", label })),
  areaOptions: [
    { label: "Ontario", region: "ontario" },
    { label: "Greater Toronto Area", region: "greater-toronto-area" },
    { label: "Quebec", region: "quebec" },
    { label: "All of Canada", country: "ca" },
    { label: "All of the U.S.", country: "us" },
  ],
  closingCa: [],
  closingUs: [],
  ticker: [],
  toast: [],
  alertTrade: "",
  alerts: [],
  winners: {
    repeat: 0,
    contracts: 0,
    value: "",
    top: [],
    most: { name: "", n: 0 },
  },
  browse: { combos: [], newest: [] },
  awards: [],
};
