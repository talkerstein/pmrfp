import type { V3Data } from "./home-v3";

/**
 * The design's hard-coded values (pmrfp.com as of 2026-10-07). Used only for a
 * piece of data whose live query fails.
 */
export const V3_FALLBACK: V3Data = {
  open: 534,
  closing7: 135,
  trades: 45,
  regions: 88,
  foundingLeft: null,
  big: { name: "General Contracting", n: 239, img: "/images/photos/site-crew-deck.webp", href: "/trades" },
  tiles: [
    { name: "Roofing", n: 41, img: "/images/home/hero-roofing.webp", href: "/trades" },
    { name: "Snow Removal", n: 39, img: "/images/home/trade-snow.webp", href: "/trades" },
    { name: "Cleaning / Janitorial", n: 38, img: "/images/home/trade-cleaning.webp", href: "/trades" },
    { name: "HVAC", n: 36, img: "/images/home/trade-hvac.webp", href: "/trades" },
    { name: "Electrical", n: 30, img: "/images/home/trade-electrical.webp", href: "/trades" },
  ],
  chips: (
    [
      ["Property Maintenance", 24],
      ["Fire Safety", 21],
      ["Elevator Services", 20],
      ["Concrete and Asphalt", 16],
      ["Landscaping", 15],
      ["Waste Removal", 13],
      ["Glass and Windows", 10],
      ["Lighting", 9],
      ["Plumbing", 8],
    ] as const
  ).map(([name, n]) => ({ name, n, href: "/trades" })),
  tradeOptions: ["Roofing", "Snow Removal", "HVAC", "Electrical", "Cleaning / Janitorial"].map((label) => ({ value: "", label })),
  areaOptions: [
    { label: "Ontario", region: "ontario" },
    { label: "Greater Toronto Area", region: "greater-toronto-area" },
    { label: "Quebec", region: "quebec" },
    { label: "All of Canada", country: "ca" },
    { label: "All of the U.S.", country: "us" },
  ],
  closingCa: [
    { mon: "Oct", day: "8", tag: "Landscaping · Toronto", left: "Tomorrow", title: "Non-exclusive supply of landscape horticulture and green infrastructure maintenance services", href: "/rfps", soon: true },
    { mon: "Oct", day: "13", tag: "Electrical · Yukon", left: "6 days left", title: "Standing offer: Generator repair services", href: "/rfps", soon: false },
    { mon: "Oct", day: "15", tag: "Fire Safety · Ottawa", left: "8 days left", title: "Sir Frederick Banting Building Fire Alarm System Improvements", href: "/rfps", soon: false },
    { mon: "Oct", day: "15", tag: "Electrical · Calgary", left: "8 days left", title: "Phase 1 ITQ - EP922-270356 NRCan – Geological Survey of Canada (GSC) Generator Load Capacity", href: "/rfps", soon: false },
  ],
  closingUs: [],
  ticker: [
    { tag: "Landscaping · Toronto", title: "Landscape horticulture and green infrastructure maintenance", when: "closes Oct 8", href: "/rfps" },
    { tag: "Electrical · Yukon", title: "Standing offer: Generator repair services", when: "closes Oct 13", href: "/rfps" },
    { tag: "Fire Safety · Ottawa", title: "Sir Frederick Banting Building Fire Alarm System Improvements", when: "closes Oct 15", href: "/rfps" },
    { tag: "Electrical · Calgary", title: "NRCan Geological Survey of Canada Generator Load Capacity", when: "closes Oct 15", href: "/rfps" },
  ],
  toast: [
    { tag: "Closes tomorrow", color: "#8A3F06", title: "Landscape horticulture maintenance · Toronto" },
    { tag: "Awarded Oct 5 · $498,992", color: "#282B59", title: "Electric boiler replacement, Mont-Joli · won by Plomberie KRTB" },
  ],
  alertTrade: "Cleaning / Janitorial",
  alerts: [
    { where: "Cleaning / Janitorial · Quebec", title: "Janitorial services for Saint-Jean and Farnham garrisons", href: "/rfps" },
    { where: "Cleaning / Janitorial · Winnipeg", title: "Building Duct Cleaning", href: "/rfps" },
    { where: "Cleaning / Janitorial · Newfoundland and Labrador", title: "Janitorial Services St. John's, NL", href: "/rfps" },
  ],
  winners: {
    repeat: 111,
    contracts: 321,
    value: "$523M",
    top: (
      [
        ["Construction Deric Inc.", 3, 131],
        ["Dexter Construction", 30, 62.5],
        ["Zutphen Contractors", 4, 30.6],
        ["Chapman Bros. Construction Ltd.", 6, 19.6],
        ["S.W. Weeks Contracting Inc.", 8, 17.8],
        ["Wildstone Construction Ltd.", 2, 16.4],
        ["Enercon Builders Inc.", 2, 14.4],
        ["Nova Construction Co. Ltd", 6, 13.8],
      ] as const
    ).map(([name, n, m]) => ({ name, n, value: `$${m}M`, weight: m, href: "/contract-winners", most: n === 30 })),
    most: { name: "Dexter Construction", n: 30 },
  },
  browse: { combos: [], newest: [] },
  awards: [
    { trade: "HVAC", value: "$498,992", title: "Replacement of electric boilers, IML, 850 Route de la mer, Mont-Joli, QC", buyer: "Gov. of Canada", winner: "Plomberie KRTB", date: "Oct 5", href: "/contract-winners" },
    { trade: "Cleaning", value: "$1,133,684", title: "Janitorial Services for Provincial Buildings in Digby Area", buyer: "Nova Scotia", winner: "Inside-Out Cleaning Services Inc", date: "Sep 10", href: "/contract-winners" },
    { trade: "Plumbing", value: "$84,511", title: "Hot Water Tank Replacements HSC Borden", buyer: "Gov. of Canada", winner: "Crystal Mechanical Inc", date: "Sep 29", href: "/contract-winners" },
  ],
};
