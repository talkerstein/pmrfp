"use client";
/* eslint-disable @next/next/no-img-element -- ported 1:1 from the design, which uses plain <img> with inline sizing. */

import "./home-v3.css";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setMarket, useVisitorMarket } from "@/components/geo/use-visitor-market";
import { useFoundingPriceLabel } from "@/components/founding/market-text";
import { joinRegionalWaitlistAction } from "@/lib/waitlist/actions";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";

/* ------------------------------------------------------------------ data */

export interface V3Closing { mon: string; day: string; tag: string; left: string; title: string; href: string; soon: boolean }
export interface V3Trade { name: string; n: number; href: string }
export interface V3Data {
  open: number;
  closing7: number;
  trades: number;
  regions: number;
  /** Founding 500 spots left; null when the count can't be read. */
  foundingLeft: number | null;
  big: V3Trade & { img: string };
  tiles: (V3Trade & { img: string })[];
  chips: V3Trade[];
  tradeOptions: { value: string; label: string }[];
  areaOptions: { label: string; region?: string; country?: "ca" | "us" }[];
  closingCa: V3Closing[];
  closingUs: V3Closing[];
  ticker: { tag: string; title: string; when: string; href: string }[];
  toast: { tag: string; color: string; title: string }[];
  alertTrade: string;
  alerts: { where: string; title: string; href: string }[];
  winners: {
    repeat: number;
    contracts: number;
    value: string;
    top: { name: string; n: number; value: string; weight: number; href: string; most: boolean }[];
    most: { name: string; n: number };
  };
  awards: { trade: string; value: string; title: string; buyer: string; winner: string; date: string; href: string }[];
}

/* ------------------------------------------------------------------ helpers */

const styleCache = new Map<string, CSSProperties>();
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
/** The design's inline style strings, verbatim, as React style objects. Font names map to the site's next/font variables. */
function s(css: string): CSSProperties {
  const hit = styleCache.get(css);
  if (hit) return hit;
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    let val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith("-webkit-") ? `Webkit${camel(prop.slice(8)).replace(/^./, (c) => c.toUpperCase())}` : camel(prop);
    if (key === "fontFamily") {
      val = val
        .replace(/'IBM Plex Mono'/g, "var(--font-plex-mono), 'IBM Plex Mono'")
        .replace(/\bPoppins\b/g, "var(--font-poppins), Poppins")
        .replace(/\bLato\b/g, "var(--font-lato), Lato");
    }
    out[key] = val;
  }
  styleCache.set(css, out as CSSProperties);
  return out as CSSProperties;
}

const IMG = {
  mark: "/brand/mark-white.svg",
  electrical: "/images/photos/electrical-panel-testing.webp",
  pmLobby: "/images/home/pm-lobby.webp",
  retail: "/images/photos/retail-power-centre-aerial.webp",
  condo: "/images/photos/condo-midrise.webp",
  keys: "/images/photos/keys-in-door.webp",
  warehouse: "/images/photos/warehouse-loading-docks.webp",
  crew: "/images/photos/site-crew-deck.webp",
  roofing: "/images/home/hero-roofing.webp",
  hvac: "/images/home/trade-hvac.webp",
  cleaning: "/images/home/trade-cleaning.webp",
};

const H = {
  home: "/",
  founding: "/founding-500",
  rfps: "/rfps",
  directory: "/directory",
  trades: "/trades",
  winners: "/contract-winners",
  jobs: "/jobs",
  postJob: "/jobs/post",
  forum: "/forum",
  pricing: "/pricing",
  marketplace: "/marketplace",
  talent: "/talent",
  talentSignUp: "/sign-up?role=talent",
  signIn: "/sign-in",
  joinTrade: "/sign-up?role=trade",
  postRfp: "/sign-up?role=property_manager",
  landlord: "/sign-up?role=landlord",
  realtor: "/sign-up?role=real_estate_agent",
  supplier: "/sign-up?role=supplier",
  suppliers: "/suppliers",
  gcPackage: "/gc-packages/new",
  forRealEstate: "/for/real-estate",
  advertise: "/advertise",
  proAnnual: signUpHrefForPlan("pro", "annual"),
  proMonthly: signUpHrefForPlan("pro", "monthly"),
  seo: signUpHrefForPlan("seo", "annual"),
  featured: signUpHrefForPlan("featured", "annual"),
};

const FOOTER_FIND: [string, string][] = [["RFPs", H.rfps], ["Trade directory", H.directory], ["Contract winners", H.winners], ["Jobs", H.jobs], ["Marketplace", H.marketplace], ["Forum", H.forum]];
const FOOTER_WHO: [string, string][] = [["Trade contractors", "/for/tradesmen"], ["Property managers", "/for-property-managers"], ["Landlords and owners", H.landlord], ["Condo boards", "/for/condo-boards"], ["Real estate", H.forRealEstate], ["Suppliers", "/for/suppliers"], ["Builders", "/for/builders"]];
const FOOTER_CO: [string, string][] = [["About", "/about"], ["Advertise", H.advertise], ["Spotlight", "/spotlight"], ["Contact", "/contact"], ["Terms", "/terms"], ["Privacy", "/privacy"]];
const FOOTER_MOBILE: [string, string][] = [["RFPs", H.rfps], ["Trade directory", H.directory], ["Contract winners", H.winners], ["Jobs", H.jobs], ["Forum", H.forum], ["Marketplace", H.marketplace], ["Property managers", "/for-property-managers"], ["Landlords", H.landlord], ["Real estate", H.forRealEstate], ["Suppliers", "/for/suppliers"], ["Advertise", H.advertise], ["About", "/about"], ["Terms", "/terms"], ["Privacy", "/privacy"]];
const NAV: [string, string][] = [["RFPs", H.rfps], ["Trade directory", H.directory], ["Contract winners", H.winners], ["Jobs", H.jobs], ["Forum", H.forum], ["Pricing", H.pricing]];

const SOURCES = [
  { code: "CA", name: "CanadaBuys", kind: "Federal" },
  { code: "US", name: "SAM.gov", kind: "U.S. federal" },
  { code: "TO", name: "City of Toronto", kind: "Municipal" },
  { code: "QC", name: "Québec SEAO", kind: "Provincial" },
  { code: "NS", name: "Nova Scotia", kind: "Provincial" },
  { code: "YT", name: "Yukon", kind: "Territorial" },
  { code: "NYC", name: "NYC City Record", kind: "Municipal" },
  { code: "+", name: "Property managers", kind: "Private RFPs" },
].map((x, i) => ({ ...x, bg: i === 7 ? "#91F2CF" : "#FFFFFF" }));

const DECK = [["The building", IMG.roofing], ["The problem", IMG.hvac], ["The solution", IMG.electrical], ["The outcome", IMG.cleaning]] as const;
const TF_D = ["translate(0px,0px) rotate(-3deg)", "translate(34px,10px) rotate(5deg)", "translate(60px,24px) rotate(11deg)", "translate(-22px,16px) rotate(-10deg)"];
const TF_M = ["translate(0px,0px) rotate(-3deg)", "translate(30px,8px) rotate(5deg)", "translate(54px,20px) rotate(11deg)", "translate(-20px,14px) rotate(-10deg)"];
const PAL = [["#91F2CF", "#1B1D3A"], ["#282B59", "#FFFFFF"], ["#4A4E85", "#FFFFFF"], ["#FFFFFF", "#1B1D3A"]];
const BUBBLES_D = ([["Pricing", "0%", "4%", 19, 0], ["Hiring", "36%", "0%", 15, 1], ["Québec", "74%", "4%", 15, 2], ["Codes and permits", "50%", "24%", 16, 3], ["Equipment", "4%", "34%", 15, 2], ["Electrical", "30%", "48%", 18, 0], ["HVAC", "74%", "50%", 15, 1], ["Roofing", "0%", "70%", 15, 3], ["Condo boards", "24%", "78%", 15, 1], ["Ontario", "62%", "76%", 17, 0]] as const).map(
  (b, i) => ({ t: b[0], x: b[1], y: b[2], size: `${b[3]}px`, bg: PAL[b[4]][0], fg: PAL[b[4]][1], dur: `${4 + (i % 4)}s`, delay: `${-i * 0.7}s` }),
);
const BUBBLES_M = ([["Pricing", "0%", "2%", 0], ["Hiring", "34%", "0%", 1], ["Québec", "68%", "6%", 2], ["Codes and permits", "40%", "24%", 3], ["Equipment", "0%", "30%", 2], ["Electrical", "22%", "50%", 0], ["HVAC", "70%", "48%", 1], ["Roofing", "0%", "72%", 3], ["Condo boards", "28%", "78%", 1], ["Ontario", "72%", "76%", 0]] as const).map(
  (b, i) => ({ t: b[0], x: b[1], y: b[2], bg: PAL[b[3]][0], fg: PAL[b[3]][1], dur: `${4 + (i % 4)}s`, delay: `${-i * 0.7}s` }),
);
const FACES = [["#EEEEF8", "#282B59", "#91F2CF"], ["#DDFBF0", "#282B59", "#1B1D3A"], ["#282B59", "#FFFFFF", "#91F2CF"], ["#91F2CF", "#282B59", "#1B1D3A"], ["#EEEEF8", "#4A4E85", "#282B59"]].map((f) => ({ bg: f[0], fg: f[1], hat: f[2] }));
const SMALL_BG = ["#4A4E85", "#444879", "#3D416F", "#363A66", "#30335D"];
const ROLL = ["electricians.", "plumbers.", "HVAC techs.", "labourers.", "apprentices.", "electricians."];
const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Seasonal", "Apprenticeship", "Temporary"];

const LIGHT = { bg: "#FFFFFF", fg: "#1B1D3A", border: "#E3E4EE", sub: "#4B4F6B", rule: "#E3E4EE", btnBg: "#FFFFFF", btnFg: "#282B59", btnBorder: "#282B59", popular: false };
const DARK = { bg: "#282B59", fg: "#FFFFFF", border: "#282B59", sub: "#C9CCE6", rule: "#4A4E85", btnBg: "#91F2CF", btnFg: "#1B1D3A", btnBorder: "#91F2CF", popular: true };
const PLANS_D = [
  { ...LIGHT, name: "Free", price: "$0", per: "forever", what: "Directory listing, basic company profile, and you appear in vendor search.", cta: "Join free", href: H.joinTrade },
  { ...LIGHT, name: "SEO Listing", price: `$${PRICING.seoAnnual}`, per: "CAD per year", what: "Trade and city page listings, unlimited project photos, case studies, Google ratings, priority over free listings.", cta: "Get SEO Listing", href: H.seo },
  { ...DARK, name: "Trade Pro", price: `$${PRICING.proAnnual}`, per: `CAD per year, or $${PRICING.proMonthly}/month`, what: "Full RFP access, matching alerts, saved opportunities, express interest, priority placement, verified vendor badge.", cta: "Start Trade Pro", href: H.proAnnual },
  { ...LIGHT, name: "Featured", price: `$${PRICING.featuredAnnual}`, per: "CAD per year", what: "Everything in Trade Pro, plus featured placement in your categories and service regions and top search results.", cta: "Get Featured", href: H.featured },
];
const PLANS_M = PLANS_D.map((p, i) => ({
  ...p,
  what: [
    p.what,
    "Trade and city page listings, unlimited project photos, case studies, Google ratings.",
    "Full RFP access, matching alerts, saved opportunities, express interest, verified vendor badge.",
    "Everything in Trade Pro, plus featured placement in your categories and regions.",
  ][i],
}));

function audience(d: V3Data) {
  return [
    { label: "For tradesmen", word: "tradesmen", img: IMG.electrical, head: "Get discovered for commercial property work.", desc: "PMRFP is where property managers post RFPs. Get listed, watch your trade and region, and bid.", descM: "Get listed, watch your trade and region, and bid.", cta: "Join as a trade company", ctaM: "Join as a trade company", href: H.joinTrade, fact: `${d.open} open contracts today` },
    { label: "For property managers", word: "property managers", img: IMG.pmLobby, head: "Post a project. Find the right vendors. No pressure to hire.", desc: "Post your building project free. Trades that match your category and region see it and bid.", descM: "Trades that match your category and region see it and bid.", cta: "Post an RFP free", ctaM: "Post an RFP free", href: H.postRfp, fact: "Free to post" },
    { label: "For landlords", word: "landlords", img: IMG.retail, head: "Own your buildings? Post repair and maintenance jobs free.", desc: "Search a credentialed directory of commercial trade contractors, by trade and region.", descM: "Search a credentialed directory of commercial trades.", cta: "Sign up as a landlord", ctaM: "Sign up as a landlord", href: H.landlord, fact: `${d.regions} regions covered` },
    { label: "For condo boards", word: "condo boards", img: IMG.condo, head: "Run open, documented RFPs.", desc: "Show owners competitive bids, side by side, with every trade’s credentials on record.", descM: "Show owners competitive bids, side by side.", cta: "Start an RFP", ctaM: "Start an RFP", href: H.postRfp, fact: "Free to post" },
    { label: "For real estate", word: "realtors", img: IMG.keys, head: "Your trusted trades. Your name. One link.", desc: "Save the trades you trust to one page and text clients a single link instead of a phone number from memory.", descM: "Text clients a single link. Free for 5 trades.", cta: "Create your trusted-trades page", ctaM: "Create your page", href: H.realtor, fact: "Free for 5 trades" },
    { label: "For suppliers", word: "suppliers", img: IMG.warehouse, head: "Get listed where trades and builders source products.", desc: "A searchable directory listing for building products, materials and equipment, by category and region.", descM: "A searchable listing by category and region.", cta: "List your company", ctaM: "List your company", href: H.supplier, fact: "Suppliers directory" },
    { label: "For builders", word: "builders", img: IMG.crew, head: "Post trade packages free.", desc: "Builders and general contractors post packages by trade. Local trades quote and bid.", descM: "Local trades quote and bid.", cta: "Post a package", ctaM: "Post a package", href: H.gcPackage, fact: "Free to post" },
  ];
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ shared bits */

const Check = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M4 11.5l4.5 4.5L18 6.5" /></svg>
);
const SmallCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
const CloseX = ({ size, stroke }: { size: number; stroke: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
);
function Face({ f, w, h }: { f: (typeof FACES)[number]; w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 44 48" fill={f.fg} aria-hidden>
      <circle cx="22" cy="18" r="10" />
      <path d="M2 48c2-12 10-17 20-17s18 5 20 17z" />
      <path d="M10 14c0-8 5-12 12-12s12 4 12 12z" fill={f.hat} />
      <rect x="8" y="13" width="28" height="3" rx="1.5" fill={f.hat} />
    </svg>
  );
}

/* ------------------------------------------------------------------ component */

export function HomeV3({ data, dataSources }: { data: V3Data; dataSources?: { live: string[]; fallback: string[] } }) {
  const router = useRouter();
  const market = useVisitorMarket();
  const foundingPrice = useFoundingPriceLabel();

  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const user = useRef(false);
  const [deck, setDeck] = useState(0);
  const [modal, setModal] = useState(false);
  const seen = useRef(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toastOn, setToastOn] = useState(false);
  const [toastOff, setToastOff] = useState(false);
  const [toastIdx, setToastIdx] = useState(0);
  const [menu, setMenu] = useState(false);

  const openModal = useCallback(() => {
    seen.current = true;
    setModal(true);
  }, []);
  const openModalLink = useCallback(
    (e: { preventDefault(): void }) => {
      e.preventDefault();
      openModal();
    },
    [openModal],
  );
  const closeModal = useCallback(() => setModal(false), []);

  useEffect(() => {
    const still = reducedMotion();
    const timer = setInterval(() => {
      if (user.current || still) return;
      setActive((a) => (a + 1) % 7);
      setTick((t) => t + 1);
    }, 4000);
    const timer2 = setInterval(() => {
      if (still) return;
      setDeck((d) => (d + 1) % 4);
    }, 2800);
    const t3 = setTimeout(() => {
      if (!seen.current) openModal();
    }, 9000);
    const t5 = setTimeout(() => setToastOn(true), 4000);
    const t4 = setInterval(() => setToastIdx((t) => t + 1), 7000);
    // Exit intent: desktop only (cursor leaves through the top of the viewport).
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !seen.current && window.matchMedia("(min-width: 1024px)").matches) openModal();
    };
    document.addEventListener("mouseleave", onLeave);
    return () => {
      clearInterval(timer);
      clearInterval(timer2);
      clearInterval(t4);
      clearTimeout(t3);
      clearTimeout(t5);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [openModal]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal]);

  const pick = (i: number) => {
    user.current = true;
    if (i !== active) {
      setActive(i);
      setTick((t) => t + 1);
    }
  };

  const aud = audience(data);
  const word = aud[active].word;
  const swapClass = tick % 2 ? "swapb" : "swapa";
  const closing = market === "US" && data.closingUs.length ? data.closingUs : data.closingCa;
  const ticker = data.ticker.concat(data.ticker);
  const toastItem = data.toast.length ? data.toast[toastIdx % data.toast.length] : null;
  const showToast = toastOn && !toastOff && !modal && toastItem != null;
  const showFounding = data.foundingLeft !== 0;
  const spots = data.foundingLeft == null ? null : `${data.foundingLeft} of 500 spots left`;
  const spotsShort = data.foundingLeft == null ? null : `${data.foundingLeft} of 500 left`;
  const w = data.winners;
  const top = w.top;
  const bigwords = [`${data.open} open tenders`, `${data.trades} trades`, `${data.regions} regions`, `${w.value} awarded`];
  const cards = DECK.map((c, i) => {
    const slot = (i - deck + 4) % 4;
    return { no: `0${i + 1}`, cap: c[0], img: c[1], slot, z: 4 - slot, stepBg: slot === 0 ? "#282B59" : "#F5F5FA", stepFg: slot === 0 ? "#FFFFFF" : "#1B1D3A", pick: () => setDeck(i) };
  });

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    const trade = String(f.get("trade") ?? "");
    if (trade) q.set("category", trade);
    const area = data.areaOptions[Number(f.get("area") ?? 0)];
    if (area?.region) q.set("region", area.region);
    if (area?.country) q.set("country", area.country);
    const qs = q.toString();
    router.push(qs ? `/rfps?${qs}` : "/rfps");
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const area = data.areaOptions[Number(f.get("area") ?? 0)];
    const fd = new FormData();
    fd.set("email", String(f.get("email") ?? ""));
    fd.set("role", "trade");
    fd.set("reason", "early_access");
    fd.set("company_website", String(f.get("company_website") ?? ""));
    const trade = String(f.get("trade") ?? "");
    if (trade) fd.set("categorySlug", trade);
    if (area?.region) fd.set("regionSlug", area.region);
    if (area?.country) fd.set("country", area.country === "us" ? "United States" : "Canada");
    startTransition(async () => {
      const res = await joinRegionalWaitlistAction({}, fd);
      if (res.error) setFormError(res.error);
      else setSent(true);
    });
  };

  const goMarket = (m: "CA" | "US") => {
    if (m === (market ?? "CA")) return;
    setMarket(m);
    router.refresh();
  };

  const tradeSelect = (st: string) => (
    <select name="trade" aria-label="Your trade" style={s(st)}>
      {data.tradeOptions.map((o) => (
        <option key={o.label} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
  const areaSelect = (st: string) => (
    <select name="area" aria-label="Your area" style={s(st)}>
      {data.areaOptions.map((o, i) => (
        <option key={o.label} value={i}>{o.label}</option>
      ))}
    </select>
  );
  const honeypot = <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />;

  /* Popup form, shared by both layouts (sizes differ only in the heading). */
  const popupBody = (headSize: string): ReactNode =>
    !sent ? (
      <div>
        <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>Free weekly tender digest</div>
        <div style={s(`font-family: Poppins, sans-serif; font-weight: 700; font-size: ${headSize}; line-height: 1.08; letter-spacing: -0.03em; color: #282B59; margin-top: 8px`)}>Get the open contracts in your trade by email.</div>
        <form onSubmit={onSubmit} style={s("margin-top: 18px; display: flex; flex-direction: column; gap: 8px; position: relative")}>
          {honeypot}
          <div style={s("display: flex; gap: 8px")}>
            <label style={s("flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1.5px solid #D5D7E6; border-radius: 12px; padding: 7px 12px")}><span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your trade</span>{tradeSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px; height: 26px")}</label>
            <label style={s("flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1.5px solid #D5D7E6; border-radius: 12px; padding: 7px 12px")}><span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your area</span>{areaSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px; height: 26px")}</label>
          </div>
          <label style={s("display: flex; flex-direction: column; border: 1.5px solid #D5D7E6; border-radius: 12px; padding: 7px 12px")}><span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Work email</span><input type="email" name="email" required autoComplete="email" placeholder="you@company.com" style={s("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; height: 26px; outline: none")} /></label>
          <button type="submit" disabled={pending} style={s(`font: inherit; font-size: 17px; font-weight: 700; height: 54px; border: 0; border-radius: 12px; background: #282B59; color: #FFFFFF; cursor: pointer; opacity: ${pending ? 0.7 : 1}`)}>{pending ? "Sending…" : "Send me the digest →"}</button>
          {formError && <div role="alert" style={s("font-size: 14px; font-weight: 700; color: #B42318")}>{formError}</div>}
        </form>
        <div style={s("margin-top: 10px; font-size: 13px; color: #4B4F6B")}>Free. No card. Unsubscribe anytime. Property manager? <a href={H.postRfp} style={s("font-weight: 700")}>Post an RFP free</a></div>
      </div>
    ) : (
      <div className="fadeup">
        <span style={s("width: 56px; height: 56px; border-radius: 999px; background: #91F2CF; display: flex; align-items: center; justify-content: center")}><Check size={28} /></span>
        <div style={s(`font-family: Poppins, sans-serif; font-weight: 700; font-size: ${headSize}; line-height: 1.08; letter-spacing: -0.03em; color: #282B59; margin-top: 16px`)}>You&apos;re on the list.</div>
        <div style={s("margin-top: 8px; color: #4B4F6B")}>The weekly digest is free. Want every match the morning it posts, with full scope, documents and buyer contact?</div>
        <a href={H.proMonthly} style={s("margin-top: 18px; text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; font-size: 17px; border-radius: 12px; height: 54px; display: flex; align-items: center; justify-content: center")}>Start Trade Pro · ${PRICING.proMonthly}/month</a>
        <button type="button" onClick={closeModal} style={s("font: inherit; margin-top: 8px; width: 100%; height: 44px; border: 0; background: transparent; color: #282B59; font-weight: 700; cursor: pointer")}>Keep browsing</button>
      </div>
    );

  const toast = (st: string) =>
    showToast && toastItem ? (
      <div className="toast" role="status" style={s(st)}>
        <button type="button" onClick={() => setToastOff(true)} aria-label="Dismiss" style={s("position: absolute; right: 2px; top: 2px; width: 40px; height: 40px; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center")}><CloseX size={12} stroke="#4B4F6B" /></button>
        <div style={s(`display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${toastItem.color}`)}><span style={s(`width: 8px; height: 8px; border-radius: 999px; background: ${toastItem.color}`)} />{toastItem.tag}</div>
        <div style={s("font-weight: 700; line-height: 1.3; margin-top: 4px")}>{toastItem.title}</div>
        <a href={H.joinTrade} onClick={openModalLink} style={s("display: inline-block; margin-top: 6px; font-weight: 700; font-size: 15px")}>Get ones like this by email →</a>
      </div>
    ) : null;

  const closeBtn = (
    <button type="button" onClick={closeModal} aria-label="Close" style={s("position: absolute; right: 12px; top: 12px; width: 44px; height: 44px; border: 0; border-radius: 999px; background: #F5F5FA; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2")}><CloseX size={16} stroke="#1B1D3A" /></button>
  );

  const workmanshipSub = "Add finished projects to your company profile.";

  return (
    <div className="pmrfp-v3" data-live={dataSources?.live.join(",")} data-fallback={dataSources?.fallback.join(",")}>
      {/* =============================================================== DESKTOP */}
      <div className="v3-desk">
        <div style={s("background: #FFFFFF; color: #1B1D3A; font-family: Lato, system-ui, sans-serif; font-size: 16px; line-height: 1.5")}>
          <div style={s("background: #1B1D3A; color: #FFFFFF")}>
            {showFounding && (
              <a href={H.founding} style={s("display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 10px 32px; font-size: 14px; text-align: center")}><span style={s("font-weight: 700")}>Founding 500: lifetime Trade Pro for one payment, for the first 500 trade and supplier companies.</span>{spots && <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 3px 10px")}>{spots}</span>}<span style={s("font-weight: 700; text-decoration: underline")}>Claim a spot →</span></a>
            )}
            <header>
              <div style={s("max-width: 1200px; margin: 0 auto; padding: 0 32px; height: 76px; display: flex; align-items: center; gap: 36px")}>
                <a href={H.home} aria-label="PMRFP home" style={s("display: flex; align-items: center; gap: 10px; text-decoration: none; color: #FFFFFF")}>
                  <img src={IMG.mark} alt="" style={s("width: 32px; height: 32px")} />
                  <span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 22px; letter-spacing: -0.01em")}>pmrfp.com</span>
                </a>
                <nav style={s("display: flex; gap: 26px; flex-grow: 1")}>
                  {NAV.map(([l, h]) => <a key={l} href={h} style={s("text-decoration: none; color: #FFFFFF")}>{l}</a>)}
                </nav>
                <div role="group" aria-label="Market" style={s("display: flex; background: #2E3160; border-radius: 999px; padding: 3px")}>
                  {(["CA", "US"] as const).map((m) => {
                    const on = (market ?? "CA") === m;
                    return <button key={m} type="button" aria-pressed={on} onClick={() => goMarket(m)} style={s(`font: inherit; font-size: 13px; ${on ? "font-weight: 700; " : ""}padding: 5px 12px; border: 0; border-radius: 999px; background: ${on ? "#FFFFFF" : "transparent"}; color: ${on ? "#1B1D3A" : "#FFFFFF"}; cursor: pointer`)}>{m}</button>;
                  })}
                </div>
                <a href={H.signIn} style={s("text-decoration: none; color: #FFFFFF")}>Sign in</a>
                <a href={H.joinTrade} onClick={openModalLink} style={s("text-decoration: none; color: #1B1D3A; background: #91F2CF; font-weight: 700; border-radius: 999px; padding: 11px 22px")}>Join free</a>
              </div>
            </header>

            <section>
              <div style={s("max-width: 1200px; margin: 0 auto; padding: 56px 32px 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 32px; align-items: end")}>
                <div style={s("grid-column: span 8")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #91F2CF; display: flex; align-items: center; gap: 10px")}><span style={s("width: 8px; height: 8px; border-radius: 999px; background: #91F2CF")} />{data.open} contracts open · Canada and the U.S.</div>
                  <h1 style={s("margin: 18px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 68px; line-height: 1.04; letter-spacing: -0.03em")}>One board for commercial property work. Built for <span key={tick} className={swapClass} style={s("color: #91F2CF")}>{word}.</span></h1>
                </div>
                <div style={s("grid-column: span 4; padding-bottom: 10px")}>
                  <p style={s("margin: 0; font-size: 18px; color: #C9CCE6")}>RFPs posted by property managers, public building tenders from government buyers, and a directory of the trades who do the work.</p>
                  <div style={s("margin-top: 18px; display: flex; gap: 10px")}><button type="button" onClick={openModal} style={s("font: inherit; border: 0; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 13px 24px; cursor: pointer; white-space: nowrap")}>Join free →</button><a href={H.postRfp} style={s("text-decoration: none; color: #FFFFFF; font-weight: 700; border: 2px solid #5A6394; border-radius: 999px; padding: 11px 22px; white-space: nowrap")}>Post an RFP free</a></div>
                </div>
              </div>

              <div style={s("max-width: 1200px; margin: 0 auto; padding: 40px 32px 64px")}>
                <div style={s("display: flex; gap: 10px")}>
                  {aud.map((p, i) => {
                    const on = i === active;
                    const no = `0${i + 1}`;
                    return (
                      <div key={p.label} className="tile" onMouseEnter={() => pick(i)} style={s(`position: relative; flex: ${on ? "7 1 0%" : "1 1 0%"}; min-width: 0; height: 480px; border-radius: 20px; overflow: hidden; background: #282B59`)}>
                        <img src={p.img} alt="" style={s(`position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: ${on ? "0.85" : "0.45"}; transform: ${on ? "scale(1.06)" : "scale(1)"}`)} />
                        <div style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 75%; background: linear-gradient(to top, rgba(20,22,58,0.96) 15%, rgba(20,22,58,0))")} />
                        {!on && (
                          <button type="button" onClick={() => pick(i)} aria-label={p.label} style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 0; padding: 0; background: transparent; cursor: pointer")}>
                            <span style={s("position: absolute; left: 50%; bottom: 26px; writing-mode: vertical-rl; transform: translateX(-50%) rotate(180deg); white-space: nowrap; font-family: Poppins, sans-serif; font-weight: 700; font-size: 16px; letter-spacing: 0.1em; text-transform: uppercase; color: #FFFFFF")}>{p.label}</span>
                            <span style={s("position: absolute; left: 50%; top: 20px; transform: translateX(-50%); font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #91F2CF")}>{no}</span>
                          </button>
                        )}
                        {on && (
                          <div className="fadeup" style={s("position: absolute; left: 32px; right: 32px; bottom: 32px")}>
                            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>{no} · {p.label}</div>
                            <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 32px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 10px")}>{p.head}</div>
                            <div style={s("font-size: 17px; color: #D9DBEE; margin-top: 10px")}>{p.desc}</div>
                            <div style={s("margin-top: 22px; display: flex; align-items: center; gap: 18px")}>
                              <a href={p.href} style={s("text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 13px 24px; white-space: nowrap")}>{p.cta} →</a>
                              <span style={s("font-size: 15px; color: #D9DBEE")}>{p.fact}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div style={s("border-top: 1px solid #2E3160; overflow: hidden; padding: 16px 0")}>
              <div className="marquee" style={s("display: flex; width: max-content")}>
                {ticker.map((k, i) => (
                  <a key={i} href={k.href} aria-hidden={i >= data.ticker.length || undefined} tabIndex={i >= data.ticker.length ? -1 : undefined} style={s("display: flex; align-items: center; gap: 12px; padding: 0 28px; white-space: nowrap; text-decoration: none; color: #FFFFFF; border-right: 1px solid #2E3160")}>
                    <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #91F2CF")}>{k.tag}</span>
                    <span style={s("font-weight: 700")}>{k.title}</span>
                    <span style={s("font-size: 14px; color: #C9CCE6")}>{k.when}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <section>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 72px 32px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 32px")}>
              {[[data.open, "contracts open right now"], [data.closing7, "close in the next 7 days"], [data.trades, "trades covered"], [data.regions, "regions in Canada and the U.S."]].map(([n, l]) => (
                <div key={l}><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 64px; line-height: 1; letter-spacing: -0.03em; color: #282B59")}>{n}</div><div style={s("margin-top: 10px; padding-top: 10px; border-top: 3px solid #91F2CF; color: #4B4F6B")}>{l}</div></div>
              ))}
            </div>
          </section>

          <section>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 96px 32px 0")}>
              <div style={s("display: flex; align-items: flex-end; justify-content: space-between; gap: 48px")}>
                <div>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>For tradesmen</div>
                  <h2 style={s("margin: 10px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.03em; color: #282B59")}>See what is open<br />in your trade.</h2>
                </div>
                <form onSubmit={onSearch} style={s("flex: 0 0 600px; display: flex; gap: 6px; background: #1B1D3A; border-radius: 999px; padding: 8px")}>
                  <label style={s("flex: 1 1 0; display: flex; flex-direction: column; background: #FFFFFF; border-radius: 999px 12px 12px 999px; padding: 8px 14px 8px 24px")}>
                    <span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your trade</span>
                    {tradeSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px")}
                  </label>
                  <label style={s("flex: 1 1 0; display: flex; flex-direction: column; background: #FFFFFF; border-radius: 12px; padding: 8px 14px")}>
                    <span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your area</span>
                    {areaSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px")}
                  </label>
                  <button type="submit" style={s("font: inherit; font-size: 16px; font-weight: 700; padding: 0 26px; border: 0; border-radius: 12px 999px 999px 12px; background: #91F2CF; color: #1B1D3A; cursor: pointer; white-space: nowrap")}>See what&apos;s open →</button>
                </form>
              </div>

              <div style={s("margin-top: 40px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-auto-rows: 210px; gap: 14px")}>
                <a className="zoom" href={data.big.href} style={s("grid-column: span 2; grid-row: span 2; position: relative; border-radius: 24px; overflow: hidden; background: #282B59; color: #FFFFFF; text-decoration: none")}>
                  <img src={data.big.img} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7")} />
                  <div style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 70%; background: linear-gradient(to top, rgba(20,22,58,0.95) 10%, rgba(20,22,58,0))")} />
                  <div style={s("position: absolute; left: 28px; right: 28px; bottom: 24px")}>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 120px; line-height: 0.95; letter-spacing: -0.04em; color: #91F2CF")}>{data.big.n}</div>
                    <div style={s("display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 24px")}>{data.big.name}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase")}>open now →</span></div>
                  </div>
                </a>
                {data.tiles.map((t) => (
                  <a key={t.name} className="zoom" href={t.href} style={s("position: relative; border-radius: 24px; overflow: hidden; background: #282B59; color: #FFFFFF; text-decoration: none")}>
                    <img src={t.img} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7")} />
                    <div style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 80%; background: linear-gradient(to top, rgba(20,22,58,0.95) 10%, rgba(20,22,58,0))")} />
                    <div style={s("position: absolute; left: 20px; right: 20px; bottom: 16px")}>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 56px; line-height: 1; letter-spacing: -0.03em; color: #91F2CF")}>{t.n}</div>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 17px; margin-top: 2px")}>{t.name}</div>
                    </div>
                  </a>
                ))}
                <a className="lift" href={H.trades} style={s("border-radius: 24px; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border: 2px solid #91F2CF")}>
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="#1B1D3A" strokeWidth="3" style={s("align-self: flex-end")} aria-hidden><path d="M9 27L27 9M12 9h15v15" /></svg>
                  <div><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 56px; line-height: 1; letter-spacing: -0.03em")}>{data.trades}</div><div style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 17px; margin-top: 2px")}>See all trades</div></div>
                </a>
              </div>

              <div style={s("margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px")}>
                {data.chips.map((c) => (
                  <a key={c.name} className="lift" href={c.href} style={s("display: flex; align-items: center; gap: 10px; text-decoration: none; color: #1B1D3A; border: 1px solid #D5D7E6; border-radius: 999px; padding: 8px 8px 8px 16px")}><span style={s("font-weight: 700")}>{c.name}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; background: #282B59; color: #FFFFFF; border-radius: 999px; padding: 2px 10px")}>{c.n}</span></a>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 80px 32px 96px")}>
              <div style={s("display: flex; align-items: baseline; justify-content: space-between")}>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; color: #282B59")}>Closing soonest</div>
                <a href={H.rfps} style={s("font-weight: 700")}>All {data.open} open →</a>
              </div>
              <div style={s("margin-top: 20px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px")}>
                {closing.map((r) => {
                  const bg = r.soon ? "#FDF0DC" : "#EEEEF8";
                  const fg = r.soon ? "#8A3F06" : "#282B59";
                  return (
                    <a key={r.href + r.title} className="lift" href={r.href} style={s("display: flex; flex-direction: column; padding: 22px; border: 1px solid #E3E4EE; border-radius: 20px; text-decoration: none; color: #1B1D3A; background: #FFFFFF")}>
                      <span style={s("display: flex; align-items: center; justify-content: space-between")}><span style={s(`background: ${bg}; color: ${fg}; border-radius: 12px; padding: 6px 14px; display: flex; align-items: baseline; gap: 6px`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase")}>{r.mon}</span><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.1")}>{r.day}</span></span><span style={s(`font-size: 14px; font-weight: 700; color: ${fg}`)}>{r.left}</span></span>
                      <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #4B4F6B; margin-top: 18px")}>{r.tag}</span>
                      <span style={s("font-weight: 700; font-size: 17px; line-height: 1.35; margin-top: 4px")}>{r.title}</span>
                    </a>
                  );
                })}
              </div>

              <div style={s("margin-top: 56px; display: flex; align-items: baseline; justify-content: space-between")}>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em; color: #282B59")}>Pulled every morning from</div>
                <div style={s("color: #4B4F6B; font-size: 14px")}>Public tender sources. PMRFP isn&apos;t affiliated with or endorsed by them.</div>
              </div>
              <div style={s("margin-top: 20px; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); border: 2px solid #282B59; border-radius: 20px; overflow: hidden")}>
                {SOURCES.map((x) => (
                  <div key={x.name} style={s(`padding: 20px 16px 18px; border-right: 1px solid #D5D7E6; background: ${x.bg}`)}>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1; letter-spacing: -0.02em; color: #282B59")}>{x.code}</div>
                    <div style={s("font-weight: 700; margin-top: 12px; line-height: 1.25")}>{x.name}</div>
                    <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4B4F6B; margin-top: 4px")}>{x.kind}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={s("background: #91F2CF; color: #1B1D3A")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 96px 32px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 32px; align-items: center")}>
              <div style={s("grid-column: span 6")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase")}>Trade Pro</div>
                <h2 style={s("margin: 10px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.03em; color: #1B1D3A")}>Every match in your inbox the morning it posts.</h2>
                <p style={s("margin: 18px 0 0; font-size: 19px; max-width: 500px")}>Tell us your trades and where you work. Every morning we check each source and email you only what fits, soonest deadline first.</p>
                <div style={s("margin-top: 28px; display: flex; flex-direction: column; gap: 12px; font-size: 17px; font-weight: 700")}>
                  {["Full scope, documents and buyer contact", "Daily email the day a matching RFP posts", "Express interest on property-manager RFPs"].map((t) => (
                    <div key={t} style={s("display: flex; align-items: center; gap: 12px")}><Check />{t}</div>
                  ))}
                </div>
                <div style={s("margin-top: 36px; display: flex; align-items: center; gap: 20px")}>
                  <a href={H.proAnnual} style={s("text-decoration: none; background: #1B1D3A; color: #FFFFFF; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 16px 32px")}>Start Trade Pro</a>
                  <div>${PRICING.proMonthly}/month or ${PRICING.proAnnual}/year. Cancel anytime.</div>
                </div>
              </div>
              <div style={s("grid-column: 7 / span 6")}>
                <div style={s("display: inline-flex; align-items: center; gap: 12px; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 8px 20px 8px 8px")}>
                  <img src={IMG.mark} alt="" style={s("width: 30px; height: 30px")} />
                  <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #91F2CF")}>9:00 AM</span>
                  <span style={s("font-weight: 700")}>{data.alerts.length} new {data.alertTrade} matches</span>
                </div>
                {data.alerts.map((a, i) => (
                  <a key={a.href + i} href={a.href} className="drop" style={s(`display: block; text-decoration: none; color: #1B1D3A; margin-top: 14px; margin-left: ${i * 36}px; animation-delay: ${i * 0.35}s; background: #FFFFFF; border: 2px solid #1B1D3A; border-radius: 20px; padding: 20px 22px`)}>
                    <div style={s("display: flex; justify-content: space-between; align-items: baseline; gap: 12px")}>
                      <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #4B4F6B")}>{a.where}</span>
                      <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #4B4F6B")}>{i + 1}/{data.alerts.length}</span>
                    </div>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px; line-height: 1.3; margin-top: 4px")}>{a.title}</div>
                    <div style={s("margin-top: 12px; display: flex; gap: 8px")}>
                      {["Full scope", "Documents", "Buyer contact"].map((t) => (
                        <span key={t} style={s("display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; background: #DDFBF0; border-radius: 999px; padding: 4px 12px")}><SmallCheck />{t}</span>
                      ))}
                    </div>
                  </a>
                ))}
                <div style={s("font-size: 14px; margin-top: 16px; margin-left: 72px")}>Built from tenders open on the board right now.</div>
              </div>
            </div>
          </section>

          <section style={s("background: #1B1D3A; color: #FFFFFF")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 96px 32px")}>
              <div style={s("display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 32px; align-items: end")}>
                <div style={s("grid-column: span 7")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>Contract winners</div>
                  <h2 style={s("margin: 10px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 48px; line-height: 1.06; letter-spacing: -0.03em")}>Who wins public property contracts in Canada.</h2>
                </div>
                <div style={s("grid-column: span 5; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 20px; padding-bottom: 6px")}>
                  {[[w.repeat, "repeat winners"], [w.contracts, "contracts"], [w.value, "awarded"]].map(([n, l]) => (
                    <div key={l}><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 40px; line-height: 1; letter-spacing: -0.03em; color: #91F2CF")}>{n}</div><div style={s("font-size: 14px; color: #C9CCE6; margin-top: 6px")}>{l}</div></div>
                  ))}
                </div>
              </div>

              {top.length >= 3 && (
                <div style={s("margin-top: 44px; display: flex; gap: 8px; height: 380px")}>
                  <a className="blk" href={top[0].href} style={s(`flex: ${top[0].weight} 1 0; min-width: 0; border-radius: 20px; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 26px; display: flex; flex-direction: column; justify-content: space-between`)}>
                    <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.08em")}>01 · TOP BY VALUE</span>
                    <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 104px; line-height: 0.95; letter-spacing: -0.04em")}>{top[0].value}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 24px; margin-top: 10px")}>{top[0].name}</span><span style={s("display: block; margin-top: 2px")}>{top[0].n} contracts</span></span>
                  </a>
                  <div style={s(`flex: ${top.slice(1).reduce((a, x) => a + x.weight, 0)} 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px`)}>
                    <div style={s(`flex: ${top[1].weight + top[2].weight} 1 0; min-height: 0; display: flex; gap: 8px`)}>
                      <a className="blk" href={top[1].href} style={s(`flex: ${top[1].weight} 1 0; min-width: 0; border-radius: 20px; background: #5FD3AC; color: #1B1D3A; text-decoration: none; padding: 20px; display: flex; flex-direction: column; justify-content: space-between`)}>
                        <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.08em")}>02{top[1].most ? " · MOST CONTRACTS" : ""}</span>
                        <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 56px; line-height: 1; letter-spacing: -0.03em")}>{top[1].value}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px; margin-top: 6px")}>{top[1].name}</span><span style={s("display: block; font-size: 15px")}>{top[1].n} contracts</span></span>
                      </a>
                      <a className="blk" href={top[2].href} style={s(`flex: ${top[2].weight} 1 0; min-width: 0; border-radius: 20px; background: #3E9F85; color: #FFFFFF; text-decoration: none; padding: 20px; display: flex; flex-direction: column; justify-content: space-between`)}>
                        <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px")}>03{top[2].most ? " · MOST CONTRACTS" : ""}</span>
                        <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1; letter-spacing: -0.02em")}>{top[2].value}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 16px; line-height: 1.25; margin-top: 6px")}>{top[2].name}</span><span style={s("display: block; font-size: 14px")}>{top[2].n} contracts</span></span>
                      </a>
                    </div>
                    {top.length > 3 && (
                      <div style={s(`flex: ${top.slice(3).reduce((a, x) => a + x.weight, 0)} 1 0; min-height: 0; display: flex; gap: 8px`)}>
                        {top.slice(3).map((x, i) => (
                          <a key={x.href} className="blk" href={x.href} style={s(`flex: ${x.weight} 1 0%; min-width: 0; border-radius: 20px; background: ${SMALL_BG[i]}; color: #FFFFFF; text-decoration: none; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden`)}>
                            <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #91F2CF")}>0{i + 4}</span>
                            <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1; letter-spacing: -0.02em")}>{x.value}</span><span style={s("display: block; font-weight: 700; font-size: 14px; line-height: 1.25; margin-top: 6px")}>{x.name}</span><span style={s("display: block; font-size: 13px; color: #C9CCE6")}>{x.n} contracts</span></span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={s("margin-top: 14px; display: flex; justify-content: space-between; font-size: 14px; color: #C9CCE6")}><span>Block size shows total contract value. All figures from official award notices.</span><a href={H.winners} style={s("color: #91F2CF; font-weight: 700")}>See who wins the most →</a></div>

              <div style={s("margin-top: 40px; background: #282B59; border: 2px solid #91F2CF; border-radius: 24px; padding: 26px 32px; display: flex; align-items: center; justify-content: space-between; gap: 32px")}>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.2; letter-spacing: -0.02em")}>{w.most.name} won {w.most.n} public contracts. The next ones are on the board now.</div>
                <button type="button" onClick={openModal} style={s("font: inherit; flex-shrink: 0; border: 0; background: #91F2CF; color: #1B1D3A; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 16px 30px; cursor: pointer; white-space: nowrap")}>See what&apos;s open in my trade →</button>
              </div>
              <div style={s("margin-top: 64px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.02em")}>Just awarded</div>
              <div style={s("margin-top: 20px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px")}>
                {data.awards.map((a) => (
                  <a key={a.href + a.title} className="blk" href={a.href} style={s("background: #282B59; border-radius: 20px; padding: 26px; text-decoration: none; color: #FFFFFF; display: flex; flex-direction: column")}>
                    <span style={s("display: flex; justify-content: space-between; align-items: baseline")}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #91F2CF")}>{a.trade}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #C9CCE6")}>{a.date}</span></span>
                    <span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 44px; line-height: 1; letter-spacing: -0.03em; margin-top: 16px")}>{a.value}</span>
                    <span style={s("font-weight: 700; line-height: 1.35; margin-top: 12px; flex-grow: 1")}>{a.title}</span>
                    <span style={s("margin-top: 18px; padding-top: 14px; border-top: 1px solid #4A4E85; font-size: 15px; color: #C9CCE6")}>Won by <span style={s("font-weight: 700; color: #FFFFFF")}>{a.winner}</span> · {a.buyer}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section style={s("background-color: #F5F5FA; background-image: radial-gradient(#D5D7E6 1.2px, transparent 1.2px); background-size: 24px 24px")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 96px 32px")}>
              <div style={s("display: flex; align-items: flex-end; justify-content: space-between; gap: 48px")}>
                <div>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>The rest of the platform</div>
                  <h2 style={s("margin: 10px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 64px; line-height: 1; letter-spacing: -0.035em; color: #282B59")}>More than a<br />tender <span style={s("background: #91F2CF; border-radius: 16px; padding: 0 14px; display: inline-block; transform: rotate(-2deg)")}>board.</span></h2>
                </div>
                <div style={s("max-width: 380px; color: #4B4F6B; font-size: 17px")}>Show your work, hire, buy materials, refer trades and talk shop, all on the same account.</div>
              </div>

              <div style={s("margin-top: 48px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px")}>
                <div style={s("grid-column: span 7; position: relative; overflow: hidden; background: #FFFFFF; border-radius: 28px; padding: 36px; display: grid; grid-template-columns: 1fr 330px; column-gap: 28px; min-height: 520px")}>
                  <div style={s("display: flex; flex-direction: column; position: relative")}>
                    <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>01 · Workmanship</div>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 36px; line-height: 1.06; letter-spacing: -0.03em; color: #282B59; margin-top: 12px")}>Show property managers a project you&apos;re proud of.</div>
                    <div style={s("margin-top: 24px; display: flex; flex-direction: column; gap: 6px; flex-grow: 1")}>
                      {cards.map((c) => (
                        <button key={c.no} type="button" aria-pressed={c.slot === 0} onClick={c.pick} style={s(`font: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; border: 0; border-radius: 12px; padding: 9px 12px; background: ${c.stepBg}; color: ${c.stepFg}; transition: background .4s ease, color .4s ease`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px")}>{c.no}</span><span style={s("font-weight: 700")}>{c.cap}</span></button>
                      ))}
                    </div>
                    <a href={H.joinTrade} style={s("margin-top: 20px; align-self: flex-start; text-decoration: none; background: #282B59; color: #FFFFFF; font-weight: 700; border-radius: 999px; padding: 13px 24px; white-space: nowrap")}>Sign up free</a>
                    <div style={s("margin-top: 12px; color: #4B4F6B; font-size: 15px")}>{workmanshipSub}</div>
                  </div>
                  <div style={s("position: relative")}>
                    <div style={s("position: absolute; right: -70px; top: -70px; width: 300px; height: 300px; border-radius: 999px; background: #91F2CF")} />
                    {cards.map((c) => (
                      <div key={c.no} className="pcard" style={s(`position: absolute; left: 30px; top: 46px; width: 250px; background: #FFFFFF; border-radius: 14px; padding: 10px 10px 0; box-shadow: 0 18px 40px rgba(27,29,58,0.22); transform: ${TF_D[c.slot]}; z-index: ${c.z}`)}>
                        <img src={c.img} alt="" style={s("display: block; width: 100%; height: 280px; object-fit: cover; border-radius: 8px")} />
                        <div style={s("display: flex; justify-content: space-between; align-items: center; padding: 10px 4px 12px")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; color: #282B59")}>{c.cap}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #4B4F6B")}>{c.no}/04</span></div>
                      </div>
                    ))}
                    <span style={s("position: absolute; left: 0; bottom: 0; font-size: 12px; font-weight: 700; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 4px 10px; z-index: 9")}>Example layout</span>
                  </div>
                </div>

                <div style={s("grid-column: span 5; position: relative; overflow: hidden; background: #1B1D3A; color: #FFFFFF; border-radius: 28px; padding: 36px; display: flex; flex-direction: column")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>02 · Forum</div>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 36px; line-height: 1.06; letter-spacing: -0.03em; margin-top: 12px")}>Shop talk for the people who keep buildings running.</div>
                  <div aria-hidden style={s("position: relative; flex-grow: 1; min-height: 210px; margin-top: 16px")}>
                    {BUBBLES_D.map((b) => (
                      <span key={b.t} className="float" style={s(`position: absolute; left: ${b.x}; top: ${b.y}; animation-duration: ${b.dur}; animation-delay: ${b.delay}; background: ${b.bg}; color: ${b.fg}; font-weight: 700; font-size: ${b.size}; border-radius: 22px 22px 22px 6px; padding: 8px 16px; white-space: nowrap`)}>{b.t}</span>
                    ))}
                  </div>
                  <div style={s("display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-top: 12px")}>
                    <a href={H.forum} style={s("text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 13px 24px; white-space: nowrap")}>Join the forum free</a>
                    <div>
                      <div aria-hidden style={s("display: flex; align-items: flex-end; gap: 5px; height: 56px; justify-content: flex-end")}>
                        {[[16, "#4A4E85"], [26, "#5A6394"], [36, "#3E9F85"], [46, "#5FD3AC"], [56, "#91F2CF"]].map(([h, c], i) => (
                          <span key={i} className="wave" style={s(`width: 18px; height: ${h}px; border-radius: 5px; background: ${c}; animation-delay: ${i * 0.2}s`)} />
                        ))}
                      </div>
                      <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #C9CCE6; margin-top: 6px; text-align: right")}>Apprentice to Master</div>
                    </div>
                  </div>
                </div>

                <div style={s("grid-column: span 4; position: relative; overflow: hidden; background: #282B59; color: #FFFFFF; border-radius: 28px; padding: 30px; display: flex; flex-direction: column; min-height: 380px")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>03 · Job board</div>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 12px")}>Post a job for</div>
                  <div style={s("height: 52px; overflow: hidden; margin-top: 2px")}>
                    <div className="roll" style={s("display: flex; flex-direction: column")}>
                      {ROLL.map((r, i) => <span key={i} aria-hidden={i > 0 || undefined} style={s("height: 52px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 40px; line-height: 52px; letter-spacing: -0.03em; color: #91F2CF; white-space: nowrap")}>{r}</span>)}
                    </div>
                  </div>
                  <div style={s("margin-top: 20px; display: flex; flex-wrap: wrap; gap: 6px; flex-grow: 1; align-content: flex-start")}>
                    {JOB_TYPES.map((t) => <span key={t} style={s(t === "Apprenticeship" ? "font-size: 14px; font-weight: 700; background: #91F2CF; color: #1B1D3A; border: 1.5px solid #91F2CF; border-radius: 999px; padding: 5px 12px" : "font-size: 14px; font-weight: 700; border: 1.5px solid #5A6394; border-radius: 999px; padding: 5px 12px")}>{t}</span>)}
                  </div>
                  <div style={s("color: #D9DBEE; font-size: 15px")}>Apply in a minute, no account needed. Free for up to 3 open jobs.</div>
                  <a href={H.postJob} style={s("margin-top: 14px; font-weight: 700; color: #91F2CF")}>Post a job free →</a>
                </div>

                <div style={s("grid-column: span 4; position: relative; overflow: hidden; background: #FFFFFF; border-radius: 28px; padding: 30px; display: flex; flex-direction: column; min-height: 380px")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>04 · Hiring</div>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; color: #282B59; margin-top: 12px")}>Skilled tradespeople, with their tickets and availability.</div>
                  <div style={s("margin-top: 22px; display: flex; align-items: center; flex-grow: 1")}>
                    {FACES.map((f, i) => (
                      <span key={i} style={s(`position: relative; width: 64px; height: 64px; margin-right: -14px; border-radius: 999px; background: ${f.bg}; border: 4px solid #FFFFFF; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; box-sizing: border-box`)}><Face f={f} w={44} h={48} /></span>
                    ))}
                    <span style={s("position: relative; margin-left: 30px; display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px")}><span style={s("position: relative; width: 12px; height: 12px")}><span className="ping" style={s("position: absolute; left: 0; top: 0; width: 12px; height: 12px; border-radius: 999px; background: #1E9E6F")} /><span style={s("position: absolute; left: 0; top: 0; width: 12px; height: 12px; border-radius: 999px; background: #1E9E6F")} /></span>Available</span>
                  </div>
                  <div style={s("display: flex; gap: 6px; flex-wrap: wrap")}><span style={s("font-size: 13px; font-weight: 700; background: #282B59; color: #FFFFFF; border-radius: 999px; padding: 4px 12px")}>Trade</span><span style={s("font-size: 13px; font-weight: 700; background: #EEEEF8; border-radius: 999px; padding: 4px 12px")}>Tickets</span><span style={s("font-size: 13px; font-weight: 700; background: #DDFBF0; border-radius: 999px; padding: 4px 12px")}>Available from</span></div>
                  <div style={s("margin-top: 14px; color: #4B4F6B; font-size: 15px")}>Message 3 people a month free. They reply to you directly.</div>
                  <div style={s("margin-top: 14px; display: flex; gap: 20px")}><a href={H.talent} style={s("font-weight: 700")}>See people →</a><a href={H.talentSignUp} style={s("font-weight: 700")}>Make a free profile →</a></div>
                </div>

                <a className="zoom" href={H.suppliers} style={s("grid-column: span 4; position: relative; min-height: 380px; background: #282B59; color: #FFFFFF; border-radius: 28px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; justify-content: flex-end; padding: 30px")}>
                  <img src={IMG.warehouse} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.6")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.96) 25%, rgba(20,22,58,0))")} />
                  <span className="spin" aria-hidden style={s("position: absolute; right: 22px; top: 22px; width: 96px; height: 96px")}><svg width="96" height="96" viewBox="0 0 96 96"><defs><path id="v3circ" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs><text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#91F2CF"><textPath href="#v3circ">FLAT ANNUAL PRICING · NOT PAY-PER-LEAD · </textPath></text></svg></span>
                  <span style={s("position: relative; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>05 · Suppliers</span>
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 12px")}>Get in front of the trades and builders who buy what you sell.</span>
                  <span style={s("position: relative; margin-top: 14px; font-weight: 700; color: #91F2CF")}>List your company →</span>
                </a>

                <a className="zoom" href={H.landlord} style={s("grid-column: span 4; position: relative; min-height: 380px; background: #282B59; color: #FFFFFF; border-radius: 28px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; justify-content: flex-end; padding: 30px")}>
                  <img src={IMG.retail} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.6")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.96) 25%, rgba(20,22,58,0))")} />
                  <span style={s("position: absolute; left: 30px; top: 30px; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 6px 14px")}>Free to post</span>
                  <span style={s("position: relative; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>06 · Landlords</span>
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 12px")}>Your portfolio deserves better vendors than whoever answers first.</span>
                  <span style={s("position: relative; margin-top: 14px; font-weight: 700; color: #91F2CF")}>Post a repair job free →</span>
                </a>

                <div style={s("grid-column: span 4; position: relative; overflow: hidden; background: #91F2CF; color: #1B1D3A; border-radius: 28px; padding: 30px; display: flex; flex-direction: column; min-height: 380px")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase")}>07 · Real estate</div>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 12px")}>Your trusted trades. Your name. One link.</div>
                  <div style={s("margin-top: 18px; flex-grow: 1; display: flex; flex-direction: column; gap: 8px; align-items: flex-end")}>
                    <div className="drop" style={s("animation-delay: 0s; background: #1B1D3A; color: #FFFFFF; border-radius: 20px 20px 6px 20px; padding: 10px 16px; max-width: 250px")}>Here&apos;s everyone I trust for the house:</div>
                    <div className="drop" style={s("animation-delay: 0.6s; background: #1B1D3A; color: #91F2CF; border-radius: 20px 20px 6px 20px; padding: 10px 16px; font-family: 'IBM Plex Mono', monospace; font-size: 14px")}>pmrfp.com/trusted/your-name</div>
                    <div className="drop" style={s("animation-delay: 1.2s; align-self: flex-start; background: #FFFFFF; border-radius: 20px 20px 20px 6px; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 5px; max-width: 270px")}>{["Inspector's fixes", "Pre-listing repairs", "Movers", "Cleaners"].map((t) => <span key={t} style={s("font-size: 13px; font-weight: 700; border: 1px solid #D5D7E6; border-radius: 999px; padding: 2px 9px")}>{t}</span>)}</div>
                  </div>
                  <div style={s("margin-top: 14px; font-size: 15px")}>Free for up to 5 trades. Realtor Pro ${PRICING.realtorAnnual}/year.</div>
                  <a href={H.forRealEstate} style={s("margin-top: 10px; font-weight: 700; color: #1B1D3A")}>Build my trusted-trades page →</a>
                </div>

                <a className="zoom" href={H.forRealEstate} style={s("grid-column: span 4; position: relative; min-height: 380px; background: #282B59; color: #FFFFFF; border-radius: 28px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; justify-content: flex-end; padding: 30px")}>
                  <img src={IMG.keys} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.65")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.96) 25%, rgba(20,22,58,0))")} />
                  <span style={s("position: relative; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>08 · Residential</span>
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 12px")}>Residential work, coming later.</span>
                  <span style={s("position: relative; margin-top: 10px; color: #D9DBEE; font-size: 15px")}>Today: clients request quotes straight from their realtor&apos;s trusted-trades page.</span>
                  <span style={s("position: relative; margin-top: 14px; font-weight: 700; color: #91F2CF")}>See trusted-trades pages →</span>
                </a>

                <div style={s("grid-column: span 12; position: relative; overflow: hidden; background: #282B59; color: #FFFFFF; border-radius: 28px")}>
                  <div aria-hidden style={s("overflow: hidden; padding-top: 18px")}>
                    <div className="marquee" style={s("display: flex; width: max-content; animation-duration: 45s")}>
                      {bigwords.concat(bigwords).map((t, i) => (
                        <span key={i} style={s(`font-family: Poppins, sans-serif; font-weight: 700; font-size: 104px; line-height: 1; letter-spacing: -0.04em; white-space: nowrap; padding-right: 40px; color: ${i % 2 ? "rgba(145,242,207,0.14)" : "#91F2CF"}; -webkit-text-stroke: 1.5px #91F2CF`)}>{t} ·</span>
                      ))}
                    </div>
                  </div>
                  <div style={s("padding: 28px 36px 36px; display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 14px; align-items: stretch")}>
                    <div style={s("display: flex; flex-direction: column; padding-right: 20px")}>
                      <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>09 · Sponsorship</div>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1.08; letter-spacing: -0.03em; margin-top: 12px; flex-grow: 1")}>Reach the trades bidding on commercial property work.</div>
                      <a href={H.advertise} style={s("margin-top: 22px; align-self: flex-start; text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 13px 24px")}>Ask about a spot</a>
                    </div>
                    <div className="blk" style={s("background: #1B1D3A; border-radius: 20px; padding: 24px; display: flex; flex-direction: column")}>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px")}>Trade Spotlight</div>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 56px; line-height: 1.1; letter-spacing: -0.03em; color: #91F2CF; margin-top: 8px")}>$149 <span style={s("font-family: Lato, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0; color: #C9CCE6")}>CAD / month</span></div>
                      <div style={s("margin-top: 12px; color: #D9DBEE; font-size: 15px")}>Your trade&apos;s pages across regions, tender and RFP pages, member dashboards and the daily match emails. Monthly click report.</div>
                    </div>
                    <div className="blk" style={s("background: #91F2CF; color: #1B1D3A; border-radius: 20px; padding: 24px; display: flex; flex-direction: column")}>
                      <div style={s("display: flex; justify-content: space-between; align-items: center")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px")}>Founding Partner</span><span style={s("font-size: 12px; font-weight: 700; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 4px 10px")}>3 partners only</span></div>
                      <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 56px; line-height: 1.1; letter-spacing: -0.03em; margin-top: 8px")}>$399 <span style={s("font-family: Lato, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0")}>CAD / month</span></div>
                      <div style={s("margin-top: 12px; font-size: 15px")}>All trades and regions, the weekly digest emails and founding partner branding. Price locked for 12 months.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 96px 32px")}>
              <div style={s("display: flex; align-items: flex-end; justify-content: space-between; gap: 32px")}>
                <h2 style={s("margin: 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 42px; line-height: 1.1; letter-spacing: -0.025em; color: #282B59; max-width: 640px")}>Free gets you seen. Trade Pro gets you every match, first.</h2>
                <div style={s("color: #4B4F6B; max-width: 330px")}>Property managers, builders and owners post RFPs free. Plans below are for trade and supplier companies, in CAD per year.</div>
              </div>
              <div style={s("margin-top: 40px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 20px; align-items: stretch")}>
                {PLANS_D.map((p) => (
                  <div key={p.name} className="lift" style={s(`border: 2px solid ${p.border}; background: ${p.bg}; color: ${p.fg}; border-radius: 24px; padding: 28px; display: flex; flex-direction: column`)}>
                    <div style={s("display: flex; justify-content: space-between; align-items: center; min-height: 28px")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px")}>{p.name}</span>{p.popular && <span style={s("font-size: 12px; font-weight: 700; background: #91F2CF; color: #1B1D3A; border-radius: 999px; padding: 4px 10px")}>Most popular</span>}</div>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 52px; line-height: 1.1; letter-spacing: -0.03em; margin-top: 14px")}>{p.price}</div>
                    <div style={s(`font-size: 14px; color: ${p.sub}`)}>{p.per}</div>
                    <div style={s(`margin-top: 18px; padding-top: 18px; border-top: 1px solid ${p.rule}; flex-grow: 1; font-size: 15px`)}>{p.what}</div>
                    <a href={p.href} style={s(`margin-top: 22px; text-align: center; text-decoration: none; font-weight: 700; border-radius: 999px; padding: 13px 18px; background: ${p.btnBg}; color: ${p.btnFg}; border: 2px solid ${p.btnBorder}`)}>{p.cta}</a>
                  </div>
                ))}
              </div>
              {showFounding && (
                <div style={s("margin-top: 24px; background: #F5F5FA; border-radius: 20px; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; gap: 24px")}>
                  <div><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 19px; color: #282B59")}>Founding 500</span><span style={s("margin-left: 14px; color: #4B4F6B")}>Lifetime Trade Pro for one payment{foundingPrice ? ` of ${foundingPrice}` : ""}, for the first 500 trade and supplier companies.</span></div>
                  <div style={s("display: flex; align-items: center; gap: 20px; white-space: nowrap")}>{spots && <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 14px")}>{spots}</span>}<a href={H.founding} style={s("font-weight: 700")}>Become a Founding member →</a></div>
                </div>
              )}
            </div>
          </section>

          <section style={s("background: #91F2CF; color: #1B1D3A")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 88px 32px; display: grid; grid-template-columns: auto 1fr auto; column-gap: 48px; align-items: center")}>
              <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 180px; line-height: 0.85; letter-spacing: -0.05em")}>{data.open}</div>
              <div><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 44px; line-height: 1.05; letter-spacing: -0.03em")}>contracts are open.<br />{data.closing7} close in the next 7 days.</div><div style={s("margin-top: 12px; font-size: 17px")}>Free forever for a directory listing. No card needed.</div></div>
              <div style={s("display: flex; flex-direction: column; gap: 10px")}>
                <button type="button" onClick={openModal} style={s("font: inherit; border: 0; background: #1B1D3A; color: #FFFFFF; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 18px 44px; cursor: pointer; white-space: nowrap")}>Join free →</button>
                <a href={H.postRfp} style={s("text-align: center; text-decoration: none; border: 2px solid #1B1D3A; color: #1B1D3A; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 16px 44px; white-space: nowrap")}>Post an RFP free</a>
              </div>
            </div>
          </section>

          <footer style={s("background: #1B1D3A; color: #FFFFFF")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 64px 32px 40px")}>
              <div style={s("display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; column-gap: 32px")}>
                <div>
                  <div style={s("display: flex; align-items: center; gap: 10px")}><img src={IMG.mark} alt="" style={s("width: 30px; height: 30px")} /><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 20px")}>pmrfp.com</span></div>
                  <div style={s("color: #C9CCE6; font-size: 15px; margin-top: 16px; max-width: 340px")}>Built in Toronto by the team behind PermitClub, in partnership with Talkerstein Consulting Group.</div>
                  <div style={s("color: #C9CCE6; font-size: 15px; margin-top: 10px")}>5050 Dufferin St., Toronto, ON M3H 5T5</div>
                </div>
                {([["Find work", FOOTER_FIND], ["Who it's for", FOOTER_WHO], ["Company", FOOTER_CO]] as const).map(([title, links]) => (
                  <div key={title} style={s("display: flex; flex-direction: column; gap: 10px; font-size: 15px")}><div style={s("font-weight: 700")}>{title}</div>{links.map(([l, h]) => <a key={l} href={h} style={s("color: #C9CCE6; text-decoration: none")}>{l}</a>)}</div>
                ))}
              </div>
              <div style={s("margin-top: 40px; padding-top: 24px; border-top: 1px solid #2E3160; font-size: 13px; color: #C9CCE6")}>PMRFP is a platform for posting RFPs and finding trades. We do not guarantee project availability, bid success, contract awards or revenue. Public tender sources are not affiliated with PMRFP.</div>
            </div>
          </footer>

          <div style={s("position: sticky; bottom: 0; z-index: 40; background: #1B1D3A; color: #FFFFFF; box-shadow: 0 -8px 24px rgba(20,22,58,0.25)")}>
            <div style={s("max-width: 1200px; margin: 0 auto; padding: 12px 32px; display: flex; align-items: center; gap: 20px")}>
              <span style={s("width: 10px; height: 10px; border-radius: 999px; background: #91F2CF; flex-shrink: 0")} />
              <div style={s("flex-grow: 1")}><span style={s("font-weight: 700")}>{data.open} contracts open.</span> <span style={s("color: #91F2CF")}>{data.closing7} close in the next 7 days.</span></div>
              <a href={H.postRfp} style={s("text-decoration: none; color: #FFFFFF; font-weight: 700; border: 2px solid #5A6394; border-radius: 999px; padding: 10px 22px")}>Post an RFP free</a>
              <button type="button" onClick={openModal} style={s("font: inherit; border: 0; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; padding: 12px 26px; cursor: pointer")}>Get matching RFPs →</button>
            </div>
          </div>
          {toast("position: fixed; left: 24px; bottom: 92px; width: 340px; z-index: 45; box-sizing: border-box; background: #FFFFFF; border: 2px solid #1B1D3A; border-radius: 18px; padding: 14px 44px 14px 16px; box-shadow: 0 14px 30px rgba(27,29,58,0.25)")}
          {modal && (
            <div onClick={(e) => e.target === e.currentTarget && closeModal()} style={s("position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 60; background: rgba(20,22,58,0.6); display: flex; align-items: center; justify-content: center; padding: 24px")}>
              <div className="pop" role="dialog" aria-modal="true" aria-label="Free weekly tender digest" style={s("position: relative; width: 100%; max-width: 900px; background: #FFFFFF; border-radius: 28px; overflow: hidden; display: grid; grid-template-columns: 0.85fr 1fr")}>
                {closeBtn}
                <div style={s("position: relative; background: #282B59; color: #FFFFFF; padding: 36px; display: flex; flex-direction: column; justify-content: flex-end; min-height: 480px")}>
                  <img src={IMG.roofing} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 80%; background: linear-gradient(to top, rgba(20,22,58,0.97) 30%, rgba(20,22,58,0))")} />
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 700; font-size: 96px; line-height: 0.9; letter-spacing: -0.04em; color: #91F2CF")}>{data.open}</span>
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 600; font-size: 22px; margin-top: 6px")}>contracts open right now</span>
                  <span style={s("position: relative; margin-top: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; color: #D9DBEE")}><span>{data.closing7} close in the next 7 days</span><span>{data.trades} trades · {data.regions} regions</span><span>Pulled every morning from 7 public sources</span></span>
                </div>
                <div style={s("padding: 44px 40px 36px")}>{popupBody("34px")}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =============================================================== MOBILE */}
      <div className="v3-mob">
        <div style={s("box-sizing: border-box; background: #FFFFFF; color: #1B1D3A; font-family: Lato, system-ui, sans-serif; font-size: 16px; line-height: 1.5")}>
          <div style={s("background: #1B1D3A; color: #FFFFFF")}>
            {showFounding && (
              <a href={H.founding} style={s("display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 10px 16px; font-size: 14px; text-align: center")}><span style={s("font-weight: 700")}>Founding 500: lifetime Trade Pro, one payment.</span>{spots && <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 3px 10px")}>{spots}</span>}<span style={s("font-weight: 700; text-decoration: underline")}>Claim a spot →</span></a>
            )}
            <header style={s("height: 64px; padding: 0 16px; display: flex; align-items: center; gap: 10px")}>
              <a href={H.home} aria-label="PMRFP home" style={s("display: flex; align-items: center; gap: 8px; text-decoration: none; color: #FFFFFF; flex-grow: 1")}>
                <img src={IMG.mark} alt="" style={s("width: 30px; height: 30px")} />
                <span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 19px; letter-spacing: -0.01em")}>pmrfp.com</span>
              </a>
              <a href={H.joinTrade} onClick={openModalLink} style={s("text-decoration: none; color: #1B1D3A; background: #91F2CF; font-weight: 700; font-size: 15px; border-radius: 999px; height: 44px; padding: 0 18px; display: flex; align-items: center")}>Join</a>
              <button type="button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu((m) => !m)} style={s("width: 44px; height: 44px; border: 0; background: transparent; padding: 0; display: flex; align-items: center; justify-content: center; margin-right: -8px; cursor: pointer")}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" aria-hidden><path d={menu ? "M5 5l14 14M19 5L5 19" : "M3 7h18M3 12h18M3 17h18"} /></svg>
              </button>
            </header>
            {menu && (
              <nav style={s("padding: 4px 16px 16px; display: flex; flex-direction: column; border-top: 1px solid #2E3160")}>
                {NAV.map(([l, h]) => <a key={l} href={h} style={s("color: #FFFFFF; text-decoration: none; min-height: 44px; display: flex; align-items: center; font-weight: 700")}>{l}</a>)}
                <a href={H.signIn} style={s("color: #FFFFFF; text-decoration: none; min-height: 44px; display: flex; align-items: center")}>Sign in</a>
                <div role="group" aria-label="Market" style={s("display: flex; align-self: flex-start; background: #2E3160; border-radius: 999px; padding: 3px; margin-top: 6px")}>
                  {(["CA", "US"] as const).map((m) => {
                    const on = (market ?? "CA") === m;
                    return <button key={m} type="button" aria-pressed={on} onClick={() => goMarket(m)} style={s(`font: inherit; font-size: 13px; ${on ? "font-weight: 700; " : ""}padding: 8px 14px; border: 0; border-radius: 999px; background: ${on ? "#FFFFFF" : "transparent"}; color: ${on ? "#1B1D3A" : "#FFFFFF"}; cursor: pointer`)}>{m}</button>;
                  })}
                </div>
              </nav>
            )}

            <section style={s("padding: 28px 16px 40px")}>
              <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #91F2CF; display: flex; align-items: center; gap: 8px")}><span style={s("width: 8px; height: 8px; border-radius: 999px; background: #91F2CF")} />{data.open} contracts open · CA and U.S.</div>
              <h1 style={s("margin: 14px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 38px; line-height: 1.06; letter-spacing: -0.03em; min-height: 202px")}>One board for commercial property work. Built for <span key={tick} className={swapClass} style={s("color: #91F2CF")}>{word}.</span></h1>
              <p style={s("margin: 12px 0 0; font-size: 16px; color: #C9CCE6")}>RFPs from property managers, public building tenders, and a directory of the trades who do the work. Pick who you are.</p>
              <div style={s("margin-top: 24px; display: flex; flex-direction: column; gap: 8px")}>
                {aud.map((p, i) => {
                  const on = i === active;
                  const no = `0${i + 1}`;
                  return (
                    <div key={p.label} className="vt" style={s(`position: relative; height: ${on ? "330px" : "54px"}; border-radius: 18px; overflow: hidden; background: #282B59`)}>
                      <img src={p.img} alt="" style={s(`position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: ${on ? "0.85" : "0.35"}`)} />
                      {!on && (
                        <button type="button" onClick={() => pick(i)} style={s("box-sizing: border-box; position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 0; padding: 0 18px; background: rgba(27,29,58,0.55); cursor: pointer; display: flex; align-items: center; justify-content: space-between; color: #FFFFFF")}>
                          <span style={s("display: flex; align-items: center; gap: 14px")}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #91F2CF")}>{no}</span><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase")}>{p.label}</span></span>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="2.5" aria-hidden><path d="M4 7l5 5 5-5" /></svg>
                        </button>
                      )}
                      {on && (
                        <>
                          <div style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.97) 35%, rgba(20,22,58,0))")} />
                          <div className="fadeup" style={s("position: absolute; left: 20px; right: 20px; bottom: 20px")}>
                            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>{no} · {p.label}</div>
                            <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 8px")}>{p.head}</div>
                            <div style={s("font-size: 15px; color: #D9DBEE; margin-top: 8px")}>{p.descM}</div>
                            <a href={p.href} style={s("margin-top: 16px; text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; height: 48px; display: flex; align-items: center; justify-content: center")}>{p.ctaM} →</a>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div style={s("border-top: 1px solid #2E3160; overflow: hidden; padding: 14px 0")}>
              <div className="marquee" style={s("display: flex; width: max-content")}>
                {ticker.map((k, i) => (
                  <a key={i} href={k.href} aria-hidden={i >= data.ticker.length || undefined} tabIndex={i >= data.ticker.length ? -1 : undefined} style={s("display: flex; align-items: center; gap: 10px; padding: 0 20px; white-space: nowrap; text-decoration: none; color: #FFFFFF; border-right: 1px solid #2E3160")}>
                    <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #91F2CF")}>{k.tag}</span>
                    <span style={s("font-weight: 700; font-size: 15px")}>{k.title}</span>
                    <span style={s("font-size: 13px; color: #C9CCE6")}>{k.when}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <section style={s("padding: 44px 16px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 28px")}>
            {[[data.open, "contracts open right now"], [data.closing7, "close in the next 7 days"], [data.trades, "trades covered"], [data.regions, "regions in Canada and the U.S."]].map(([n, l]) => (
              <div key={l}><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 48px; line-height: 1; letter-spacing: -0.03em; color: #282B59")}>{n}</div><div style={s("margin-top: 8px; padding-top: 8px; border-top: 3px solid #91F2CF; color: #4B4F6B; font-size: 15px")}>{l}</div></div>
            ))}
          </section>

          <section style={s("padding: 64px 16px 0")}>
            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>For tradesmen</div>
            <h2 style={s("margin: 8px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1.06; letter-spacing: -0.03em; color: #282B59")}>See what is open in your trade.</h2>
            <form onSubmit={onSearch} style={s("margin-top: 20px; display: flex; flex-direction: column; gap: 6px; background: #1B1D3A; border-radius: 22px; padding: 8px")}>
              <label style={s("display: flex; flex-direction: column; background: #FFFFFF; border-radius: 16px 16px 8px 8px; padding: 8px 16px")}>
                <span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your trade</span>
                {tradeSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px; height: 28px")}
              </label>
              <label style={s("display: flex; flex-direction: column; background: #FFFFFF; border-radius: 8px; padding: 8px 16px")}>
                <span style={s("font-size: 12px; font-weight: 700; color: #4B4F6B")}>Your area</span>
                {areaSelect("font: inherit; font-weight: 700; border: 0; background: transparent; color: #1B1D3A; padding: 0; margin-left: -4px; height: 28px")}
              </label>
              <button type="submit" style={s("font: inherit; font-size: 17px; font-weight: 700; height: 54px; border: 0; border-radius: 8px 8px 16px 16px; background: #91F2CF; color: #1B1D3A; cursor: pointer")}>See what&apos;s open →</button>
            </form>

            <a href={data.big.href} style={s("margin-top: 20px; display: block; position: relative; height: 220px; border-radius: 22px; overflow: hidden; background: #282B59; color: #FFFFFF; text-decoration: none")}>
              <img src={data.big.img} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7")} />
              <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 80%; background: linear-gradient(to top, rgba(20,22,58,0.95) 10%, rgba(20,22,58,0))")} />
              <span style={s("position: absolute; left: 20px; right: 20px; bottom: 16px")}><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 84px; line-height: 0.95; letter-spacing: -0.04em; color: #91F2CF")}>{data.big.n}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 20px; margin-top: 4px")}>{data.big.name}</span></span>
            </a>
            <div style={s("margin-top: 10px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 150px; gap: 10px")}>
              {data.tiles.map((t) => (
                <a key={t.name} href={t.href} style={s("position: relative; border-radius: 20px; overflow: hidden; background: #282B59; color: #FFFFFF; text-decoration: none")}>
                  <img src={t.img} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.95) 10%, rgba(20,22,58,0))")} />
                  <span style={s("position: absolute; left: 14px; right: 14px; bottom: 12px")}><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 42px; line-height: 1; letter-spacing: -0.03em; color: #91F2CF")}>{t.n}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 15px; line-height: 1.2; margin-top: 2px")}>{t.name}</span></span>
                </a>
              ))}
              <a href={H.trades} style={s("border-radius: 20px; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 14px; display: flex; flex-direction: column; justify-content: space-between")}>
                <svg width="30" height="30" viewBox="0 0 36 36" fill="none" stroke="#1B1D3A" strokeWidth="3" style={s("align-self: flex-end")} aria-hidden><path d="M9 27L27 9M12 9h15v15" /></svg>
                <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 42px; line-height: 1; letter-spacing: -0.03em")}>{data.trades}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 15px")}>See all trades</span></span>
              </a>
            </div>
            <div className="hs" style={s("margin: 12px -16px 0; padding: 0 16px; display: flex; gap: 8px; overflow-x: auto")}>
              {data.chips.map((c) => (
                <a key={c.name} href={c.href} style={s("flex-shrink: 0; display: flex; align-items: center; gap: 8px; text-decoration: none; color: #1B1D3A; border: 1px solid #D5D7E6; border-radius: 999px; height: 44px; box-sizing: border-box; padding: 0 8px 0 16px; white-space: nowrap")}><span style={s("font-weight: 700")}>{c.name}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px; background: #282B59; color: #FFFFFF; border-radius: 999px; padding: 2px 10px")}>{c.n}</span></a>
              ))}
            </div>
          </section>

          <section style={s("padding: 56px 16px 0")}>
            <div style={s("display: flex; align-items: baseline; justify-content: space-between")}>
              <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.02em; color: #282B59")}>Closing soonest</div>
              <a href={H.rfps} style={s("font-weight: 700; font-size: 15px")}>All {data.open} →</a>
            </div>
            <div className="hs" style={s("margin: 16px -16px 0; padding: 0 16px; display: flex; gap: 10px; overflow-x: auto")}>
              {closing.map((r) => {
                const bg = r.soon ? "#FDF0DC" : "#EEEEF8";
                const fg = r.soon ? "#8A3F06" : "#282B59";
                return (
                  <a key={r.href + r.title} href={r.href} style={s("flex: 0 0 260px; display: flex; flex-direction: column; padding: 18px; border: 1px solid #E3E4EE; border-radius: 20px; text-decoration: none; color: #1B1D3A; background: #FFFFFF")}>
                    <span style={s("display: flex; align-items: center; justify-content: space-between")}><span style={s(`background: ${bg}; color: ${fg}; border-radius: 12px; padding: 6px 14px; display: flex; align-items: baseline; gap: 6px`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase")}>{r.mon}</span><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.1")}>{r.day}</span></span><span style={s(`font-size: 14px; font-weight: 700; color: ${fg}`)}>{r.left}</span></span>
                    <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #4B4F6B; margin-top: 14px")}>{r.tag}</span>
                    <span style={s("font-weight: 700; line-height: 1.35; margin-top: 4px")}>{r.title}</span>
                  </a>
                );
              })}
            </div>

            <div style={s("margin-top: 48px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.02em; color: #282B59")}>Pulled every morning from</div>
            <div style={s("margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 2px solid #282B59; border-radius: 20px; overflow: hidden")}>
              {SOURCES.map((x) => (
                <div key={x.name} style={s(`padding: 16px 14px; border-right: 1px solid #D5D7E6; border-bottom: 1px solid #D5D7E6; background: ${x.bg}`)}>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 28px; line-height: 1; letter-spacing: -0.02em; color: #282B59")}>{x.code}</div>
                  <div style={s("font-weight: 700; margin-top: 8px; line-height: 1.25")}>{x.name}</div>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #4B4F6B; margin-top: 2px")}>{x.kind}</div>
                </div>
              ))}
            </div>
            <div style={s("color: #4B4F6B; font-size: 13px; margin-top: 10px")}>Public tender sources. PMRFP isn&apos;t affiliated with or endorsed by them.</div>
          </section>

          <section style={s("margin-top: 64px; background: #91F2CF; color: #1B1D3A; padding: 56px 16px")}>
            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase")}>Trade Pro</div>
            <h2 style={s("margin: 8px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1.06; letter-spacing: -0.03em")}>Every match in your inbox the morning it posts.</h2>
            <p style={s("margin: 14px 0 0")}>Tell us your trades and where you work. Every morning we check each source and email you only what fits, soonest deadline first.</p>
            <div style={s("margin-top: 24px; display: inline-flex; align-items: center; gap: 10px; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 6px 16px 6px 6px")}>
              <img src={IMG.mark} alt="" style={s("width: 28px; height: 28px")} />
              <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #91F2CF")}>9:00 AM</span>
              <span style={s("font-weight: 700; font-size: 14px")}>{data.alerts.length} new {data.alertTrade.split(" / ")[0]} matches</span>
            </div>
            {data.alerts.map((a, i) => (
              <a key={a.href + i} href={a.href} className="drop" style={s(`display: block; text-decoration: none; color: #1B1D3A; margin-top: 10px; margin-left: ${i * 14}px; animation-delay: ${i * 0.35}s; background: #FFFFFF; border: 2px solid #1B1D3A; border-radius: 18px; padding: 14px 16px`)}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #4B4F6B")}>{a.where}</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 16px; line-height: 1.3; margin-top: 2px")}>{a.title}</div>
                <div style={s("margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px")}>{["Full scope", "Documents", "Buyer contact"].map((t) => <span key={t} style={s("font-size: 13px; font-weight: 700; background: #DDFBF0; border-radius: 999px; padding: 2px 10px")}>{t}</span>)}</div>
              </a>
            ))}
            <a href={H.proAnnual} style={s("margin-top: 28px; text-decoration: none; background: #1B1D3A; color: #FFFFFF; font-weight: 700; font-size: 17px; border-radius: 999px; height: 54px; display: flex; align-items: center; justify-content: center")}>Start Trade Pro</a>
            <div style={s("margin-top: 10px; text-align: center; font-size: 15px")}>${PRICING.proMonthly}/month or ${PRICING.proAnnual}/year. Cancel anytime.</div>
          </section>

          <section style={s("background: #1B1D3A; color: #FFFFFF; padding: 56px 16px")}>
            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>Contract winners</div>
            <h2 style={s("margin: 8px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1.06; letter-spacing: -0.03em")}>Who wins public property contracts in Canada.</h2>
            <div style={s("margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 12px")}>
              {[[w.repeat, "repeat winners"], [w.contracts, "contracts"], [w.value, "awarded"]].map(([n, l]) => (
                <div key={l}><div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 30px; line-height: 1; letter-spacing: -0.03em; color: #91F2CF")}>{n}</div><div style={s("font-size: 13px; color: #C9CCE6; margin-top: 4px")}>{l}</div></div>
              ))}
            </div>
            {top.length >= 3 && (
              <div style={s("margin-top: 28px; display: flex; flex-direction: column; gap: 6px")}>
                <a href={top[0].href} style={s("border-radius: 18px; background: #91F2CF; color: #1B1D3A; text-decoration: none; padding: 18px; height: 190px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between")}>
                  <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em")}>01 · TOP BY VALUE</span>
                  <span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 72px; line-height: 0.95; letter-spacing: -0.04em")}>{top[0].value}</span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 600; font-size: 18px; margin-top: 6px")}>{top[0].name} · {top[0].n} contracts</span></span>
                </a>
                <div style={s("display: flex; gap: 6px; height: 150px")}>
                  <a href={top[1].href} style={s(`flex: ${top[1].weight} 1 0; min-width: 0; border-radius: 18px; background: #5FD3AC; color: #1B1D3A; text-decoration: none; padding: 14px; display: flex; flex-direction: column; justify-content: space-between`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px")}>02</span><span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 36px; line-height: 1; letter-spacing: -0.03em")}>{top[1].value}</span><span style={s("display: block; font-weight: 700; font-size: 14px; line-height: 1.25; margin-top: 4px")}>{top[1].name}</span><span style={s("display: block; font-size: 13px")}>{top[1].n} contracts</span></span></a>
                  <a href={top[2].href} style={s(`flex: ${Math.max(top[2].weight, top[1].weight * 0.58)} 1 0; min-width: 0; border-radius: 18px; background: #3E9F85; color: #FFFFFF; text-decoration: none; padding: 14px; display: flex; flex-direction: column; justify-content: space-between`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px")}>03</span><span><span style={s("display: block; font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1; letter-spacing: -0.02em")}>{top[2].value}</span><span style={s("display: block; font-weight: 700; font-size: 13px; line-height: 1.25; margin-top: 4px")}>{top[2].name}</span><span style={s("display: block; font-size: 12px")}>{top[2].n} contracts</span></span></a>
                </div>
                {top.slice(3).map((x, i) => (
                  <a key={x.href} href={x.href} style={s(`border-radius: 14px; background: ${SMALL_BG[i]}; color: #FFFFFF; text-decoration: none; padding: 12px 16px; display: grid; grid-template-columns: 28px 1fr auto; column-gap: 10px; align-items: center`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #91F2CF")}>0{i + 4}</span><span style={s("min-width: 0")}><span style={s("display: block; font-weight: 700; font-size: 15px; line-height: 1.25")}>{x.name}</span><span style={s("display: block; font-size: 13px; color: #C9CCE6")}>{x.n} contracts</span></span><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 20px")}>{x.value}</span></a>
                ))}
              </div>
            )}
            <a href={H.winners} style={s("margin-top: 14px; display: inline-block; color: #91F2CF; font-weight: 700")}>See who wins the most →</a>

            <div style={s("margin-top: 28px; background: #282B59; border: 2px solid #91F2CF; border-radius: 20px; padding: 20px")}>
              <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 20px; line-height: 1.2")}>{w.most.name} won {w.most.n} public contracts. The next ones are on the board now.</div>
              <button type="button" onClick={openModal} style={s("font: inherit; margin-top: 14px; width: 100%; border: 0; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; height: 50px; cursor: pointer")}>See what&apos;s open in my trade →</button>
            </div>
            <div style={s("margin-top: 44px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.02em")}>Just awarded</div>
            <div className="hs" style={s("margin: 16px -16px 0; padding: 0 16px; display: flex; gap: 10px; overflow-x: auto")}>
              {data.awards.map((a) => (
                <a key={a.href + a.title} href={a.href} style={s("flex: 0 0 270px; background: #282B59; border-radius: 20px; padding: 20px; text-decoration: none; color: #FFFFFF; display: flex; flex-direction: column")}>
                  <span style={s("display: flex; justify-content: space-between")}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #91F2CF")}>{a.trade}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #C9CCE6")}>{a.date}</span></span>
                  <span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 34px; line-height: 1; letter-spacing: -0.03em; margin-top: 12px")}>{a.value}</span>
                  <span style={s("font-weight: 700; line-height: 1.35; margin-top: 10px; flex-grow: 1")}>{a.title}</span>
                  <span style={s("margin-top: 14px; padding-top: 12px; border-top: 1px solid #4A4E85; font-size: 14px; color: #C9CCE6")}>Won by <span style={s("font-weight: 700; color: #FFFFFF")}>{a.winner}</span></span>
                </a>
              ))}
            </div>
          </section>

          <section style={s("background-color: #F5F5FA; background-image: radial-gradient(#D5D7E6 1.2px, transparent 1.2px); background-size: 24px 24px; padding: 56px 16px")}>
            <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>The rest of the platform</div>
            <h2 style={s("margin: 8px 0 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 42px; line-height: 1.02; letter-spacing: -0.035em; color: #282B59")}>More than a tender <span style={s("background: #91F2CF; border-radius: 12px; padding: 0 10px; display: inline-block; transform: rotate(-2deg)")}>board.</span></h2>

            <div style={s("margin-top: 28px; display: flex; flex-direction: column; gap: 12px")}>
              <div style={s("position: relative; overflow: hidden; background: #FFFFFF; border-radius: 24px; padding: 24px")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>01 · Workmanship</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 28px; line-height: 1.08; letter-spacing: -0.03em; color: #282B59; margin-top: 10px")}>Show property managers a project you&apos;re proud of.</div>
                <div style={s("position: relative; height: 330px; margin-top: 16px")}>
                  <div style={s("position: absolute; right: -80px; top: 10px; width: 260px; height: 260px; border-radius: 999px; background: #91F2CF")} />
                  {cards.map((c) => (
                    <div key={c.no} className="pcard" style={s(`position: absolute; left: 34px; top: 20px; width: 210px; background: #FFFFFF; border-radius: 12px; padding: 8px 8px 0; box-shadow: 0 14px 30px rgba(27,29,58,0.22); transform: ${TF_M[c.slot]}; z-index: ${c.z}`)}>
                      <img src={c.img} alt="" style={s("display: block; width: 100%; height: 220px; object-fit: cover; border-radius: 7px")} />
                      <div style={s("display: flex; justify-content: space-between; align-items: center; padding: 8px 4px 10px")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; color: #282B59")}>{c.cap}</span><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #4B4F6B")}>{c.no}/04</span></div>
                    </div>
                  ))}
                  <span style={s("position: absolute; left: 0; bottom: 0; font-size: 12px; font-weight: 700; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 4px 10px; z-index: 9")}>Example layout</span>
                </div>
                <div style={s("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px")}>
                  {cards.map((c) => (
                    <button key={c.no} type="button" aria-pressed={c.slot === 0} onClick={c.pick} style={s(`font: inherit; text-align: left; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 12px; height: 44px; padding: 0 12px; background: ${c.stepBg}; color: ${c.stepFg}; transition: background .4s ease, color .4s ease; cursor: pointer`)}><span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px")}>{c.no}</span><span style={s("font-weight: 700; font-size: 15px")}>{c.cap}</span></button>
                  ))}
                </div>
                <a href={H.joinTrade} style={s("margin-top: 18px; text-decoration: none; background: #282B59; color: #FFFFFF; font-weight: 700; border-radius: 999px; height: 50px; display: flex; align-items: center; justify-content: center")}>Sign up free</a>
              </div>

              <div style={s("position: relative; overflow: hidden; background: #1B1D3A; color: #FFFFFF; border-radius: 24px; padding: 24px")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>02 · Forum</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 28px; line-height: 1.08; letter-spacing: -0.03em; margin-top: 10px")}>Shop talk for the people who keep buildings running.</div>
                <div aria-hidden style={s("position: relative; height: 220px; margin-top: 14px")}>
                  {BUBBLES_M.map((b) => (
                    <span key={b.t} className="float" style={s(`position: absolute; left: ${b.x}; top: ${b.y}; animation-duration: ${b.dur}; animation-delay: ${b.delay}; background: ${b.bg}; color: ${b.fg}; font-weight: 700; font-size: 14px; border-radius: 20px 20px 20px 6px; padding: 7px 13px; white-space: nowrap`)}>{b.t}</span>
                  ))}
                </div>
                <div style={s("display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 8px")}>
                  <a href={H.forum} style={s("text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; height: 48px; padding: 0 20px; display: flex; align-items: center; white-space: nowrap")}>Join the forum free</a>
                  <div aria-hidden style={s("display: flex; align-items: flex-end; gap: 4px; height: 48px")}>
                    {[[14, "#4A4E85"], [22, "#5A6394"], [30, "#3E9F85"], [39, "#5FD3AC"], [48, "#91F2CF"]].map(([h, c], i) => (
                      <span key={i} className="wave" style={s(`width: 14px; height: ${h}px; border-radius: 4px; background: ${c}; animation-delay: ${i * 0.2}s`)} />
                    ))}
                  </div>
                </div>
              </div>

              <div style={s("background: #282B59; color: #FFFFFF; border-radius: 24px; padding: 24px")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>03 · Job board</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 10px")}>Post a job for</div>
                <div style={s("height: 46px; overflow: hidden")}>
                  <div className="roll" style={s("display: flex; flex-direction: column")}>
                    {ROLL.map((r, i) => <span key={i} aria-hidden={i > 0 || undefined} style={s("height: 46px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 36px; line-height: 46px; letter-spacing: -0.03em; color: #91F2CF")}>{r}</span>)}
                  </div>
                </div>
                <div style={s("margin-top: 14px; color: #D9DBEE; font-size: 15px")}>Apply in a minute, no account needed. Free for up to 3 open jobs.</div>
                <a href={H.postJob} style={s("margin-top: 14px; display: inline-flex; align-items: center; min-height: 44px; font-weight: 700; color: #91F2CF")}>Post a job free →</a>
              </div>

              <div style={s("background: #FFFFFF; border-radius: 24px; padding: 24px")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4B4F6B")}>04 · Hiring</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.12; letter-spacing: -0.02em; color: #282B59; margin-top: 10px")}>Skilled tradespeople, with their tickets and availability.</div>
                <div style={s("margin-top: 18px; display: flex; align-items: center")}>
                  {FACES.slice(0, 4).map((f, i) => (
                    <span key={i} style={s(`width: 56px; height: 56px; margin-right: -12px; border-radius: 999px; background: ${f.bg}; border: 4px solid #FFFFFF; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; box-sizing: border-box`)}><Face f={f} w={38} h={42} /></span>
                  ))}
                  <span style={s("margin-left: 26px; display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px")}><span style={s("position: relative; width: 12px; height: 12px")}><span className="ping" style={s("position: absolute; left: 0; top: 0; width: 12px; height: 12px; border-radius: 999px; background: #1E9E6F")} /><span style={s("position: absolute; left: 0; top: 0; width: 12px; height: 12px; border-radius: 999px; background: #1E9E6F")} /></span>Available</span>
                </div>
                <div style={s("margin-top: 14px; color: #4B4F6B; font-size: 15px")}>Message 3 people a month free. They reply to you directly.</div>
                <div style={s("margin-top: 8px; display: flex; gap: 20px")}><a href={H.talent} style={s("font-weight: 700; min-height: 44px; display: flex; align-items: center")}>See people →</a><a href={H.talentSignUp} style={s("font-weight: 700; min-height: 44px; display: flex; align-items: center")}>Make a free profile →</a></div>
              </div>

              {[
                { label: "05 · Suppliers", img: IMG.warehouse, head: "Get in front of the trades and builders who buy what you sell.", sub: "Flat annual pricing, not pay-per-lead.", cta: "List your company", href: H.suppliers },
                { label: "06 · Landlords", img: IMG.retail, head: "Your portfolio deserves better vendors than whoever answers first.", sub: "Free to post.", cta: "Post a repair job free", href: H.landlord },
                { label: "07 · Residential", img: IMG.keys, head: "Residential work, coming later.", sub: "Today: clients request quotes straight from their realtor’s trusted-trades page.", cta: "See trusted-trades pages", href: H.forRealEstate },
              ].map((t) => (
                <a key={t.label} href={t.href} style={s("position: relative; min-height: 300px; background: #282B59; color: #FFFFFF; border-radius: 24px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; justify-content: flex-end; padding: 24px")}>
                  <img src={t.img} alt="" style={s("position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.6")} />
                  <span style={s("position: absolute; left: 0; right: 0; bottom: 0; height: 85%; background: linear-gradient(to top, rgba(20,22,58,0.96) 25%, rgba(20,22,58,0))")} />
                  <span style={s("position: relative; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>{t.label}</span>
                  <span style={s("position: relative; font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 10px")}>{t.head}</span>
                  <span style={s("position: relative; margin-top: 8px; color: #D9DBEE; font-size: 15px")}>{t.sub}</span>
                  <span style={s("position: relative; margin-top: 12px; font-weight: 700; color: #91F2CF")}>{t.cta} →</span>
                </a>
              ))}

              <div style={s("background: #91F2CF; color: #1B1D3A; border-radius: 24px; padding: 24px")}>
                <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase")}>08 · Real estate</div>
                <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.12; letter-spacing: -0.02em; margin-top: 10px")}>Your trusted trades. Your name. One link.</div>
                <div style={s("margin-top: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end")}>
                  <div className="drop" style={s("animation-delay: 0s; background: #1B1D3A; color: #FFFFFF; border-radius: 20px 20px 6px 20px; padding: 10px 16px; max-width: 250px")}>Here&apos;s everyone I trust for the house:</div>
                  <div className="drop" style={s("animation-delay: 0.6s; background: #1B1D3A; color: #91F2CF; border-radius: 20px 20px 6px 20px; padding: 10px 16px; font-family: 'IBM Plex Mono', monospace; font-size: 14px")}>pmrfp.com/trusted/your-name</div>
                </div>
                <div style={s("margin-top: 16px; font-size: 15px")}>Free for up to 5 trades. Realtor Pro ${PRICING.realtorAnnual}/year.</div>
                <a href={H.forRealEstate} style={s("margin-top: 6px; display: inline-flex; align-items: center; min-height: 44px; font-weight: 700; color: #1B1D3A")}>Build my trusted-trades page →</a>
              </div>

              <div style={s("position: relative; overflow: hidden; background: #282B59; color: #FFFFFF; border-radius: 24px")}>
                <div aria-hidden style={s("overflow: hidden; padding-top: 14px")}>
                  <div className="marquee" style={s("display: flex; width: max-content; animation-duration: 35s")}>
                    {bigwords.slice(0, 3).concat(bigwords.slice(0, 3)).map((t, i) => (
                      <span key={i} style={s(`font-family: Poppins, sans-serif; font-weight: 700; font-size: 64px; line-height: 1; letter-spacing: -0.04em; white-space: nowrap; padding-right: 26px; color: ${i % 2 ? "rgba(145,242,207,0.2)" : "#91F2CF"}`)}>{t} ·</span>
                    ))}
                  </div>
                </div>
                <div style={s("padding: 20px 24px 24px")}>
                  <div style={s("font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #91F2CF")}>09 · Sponsorship</div>
                  <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 26px; line-height: 1.1; letter-spacing: -0.03em; margin-top: 10px")}>Reach the trades bidding on commercial property work.</div>
                  <div style={s("margin-top: 18px; background: #1B1D3A; border-radius: 18px; padding: 18px")}>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 600")}>Trade Spotlight</div>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 44px; line-height: 1.1; letter-spacing: -0.03em; color: #91F2CF")}>$149 <span style={s("font-family: Lato, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0; color: #C9CCE6")}>CAD / month</span></div>
                  </div>
                  <div style={s("margin-top: 8px; background: #91F2CF; color: #1B1D3A; border-radius: 18px; padding: 18px")}>
                    <div style={s("display: flex; justify-content: space-between; align-items: center")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600")}>Founding Partner</span><span style={s("font-size: 12px; font-weight: 700; background: #1B1D3A; color: #FFFFFF; border-radius: 999px; padding: 4px 10px")}>3 partners only</span></div>
                    <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 44px; line-height: 1.1; letter-spacing: -0.03em")}>$399 <span style={s("font-family: Lato, sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0")}>CAD / month</span></div>
                  </div>
                  <a href={H.advertise} style={s("margin-top: 16px; text-decoration: none; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; height: 50px; display: flex; align-items: center; justify-content: center")}>Ask about a spot</a>
                </div>
              </div>
            </div>
          </section>

          <section style={s("padding: 56px 16px")}>
            <h2 style={s("margin: 0; font-family: Poppins, sans-serif; font-weight: 700; font-size: 32px; line-height: 1.08; letter-spacing: -0.03em; color: #282B59")}>Free gets you seen. Trade Pro gets you every match, first.</h2>
            <div style={s("margin-top: 10px; color: #4B4F6B; font-size: 15px")}>Property managers, builders and owners post RFPs free. Plans are for trade and supplier companies.</div>
            <div style={s("margin-top: 24px; display: flex; flex-direction: column; gap: 10px")}>
              {PLANS_M.map((p) => (
                <div key={p.name} style={s(`border: 2px solid ${p.border}; background: ${p.bg}; color: ${p.fg}; border-radius: 22px; padding: 22px`)}>
                  <div style={s("display: flex; justify-content: space-between; align-items: center")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 18px")}>{p.name}</span>{p.popular && <span style={s("font-size: 12px; font-weight: 700; background: #91F2CF; color: #1B1D3A; border-radius: 999px; padding: 4px 10px")}>Most popular</span>}</div>
                  <div style={s("display: flex; align-items: baseline; gap: 10px; margin-top: 6px")}><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 44px; line-height: 1.1; letter-spacing: -0.03em")}>{p.price}</span><span style={s(`font-size: 14px; color: ${p.sub}`)}>{p.per}</span></div>
                  <div style={s("margin-top: 10px; font-size: 15px")}>{p.what}</div>
                  <a href={p.href} style={s(`margin-top: 16px; text-decoration: none; font-weight: 700; border-radius: 999px; height: 48px; display: flex; align-items: center; justify-content: center; background: ${p.btnBg}; color: ${p.btnFg}; border: 2px solid ${p.btnBorder}`)}>{p.cta}</a>
                </div>
              ))}
            </div>
            {showFounding && (
              <div style={s("margin-top: 12px; background: #F5F5FA; border-radius: 20px; padding: 20px")}>
                <div style={s("display: flex; justify-content: space-between; align-items: baseline")}><span style={s("font-family: Poppins, sans-serif; font-weight: 600; font-size: 18px; color: #282B59")}>Founding 500</span>{spotsShort && <span style={s("font-family: 'IBM Plex Mono', monospace; font-size: 13px")}>{spotsShort}</span>}</div>
                <div style={s("margin-top: 6px; color: #4B4F6B; font-size: 15px")}>Lifetime Trade Pro for one payment{foundingPrice ? ` of ${foundingPrice}` : ""}, for the first 500 trade and supplier companies.</div>
                <a href={H.founding} style={s("margin-top: 6px; display: inline-flex; align-items: center; min-height: 44px; font-weight: 700")}>Become a Founding member →</a>
              </div>
            )}
          </section>

          <section style={s("background: #91F2CF; color: #1B1D3A; padding: 56px 16px; text-align: center")}>
            <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 84px; line-height: 0.95; letter-spacing: -0.04em")}>{data.open}</div>
            <div style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 28px; line-height: 1.1; letter-spacing: -0.03em; margin-top: 8px")}>contracts are open. {data.closing7} close in the next 7 days.</div>
            <button type="button" onClick={openModal} style={s("font: inherit; margin-top: 24px; width: 100%; border: 0; background: #1B1D3A; color: #FFFFFF; font-weight: 700; font-size: 17px; border-radius: 999px; height: 56px; cursor: pointer")}>Join free</button>
            <a href={H.postRfp} style={s("margin-top: 10px; text-decoration: none; border: 2px solid #1B1D3A; color: #1B1D3A; font-weight: 700; font-size: 17px; border-radius: 999px; height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: center")}>Post an RFP free</a>
            <div style={s("margin-top: 12px; font-size: 14px")}>Free forever for a directory listing. No card needed.</div>
          </section>

          <footer style={s("background: #1B1D3A; color: #FFFFFF; padding: 44px 16px 32px")}>
            <div style={s("display: flex; align-items: center; gap: 10px")}><img src={IMG.mark} alt="" style={s("width: 30px; height: 30px")} /><span style={s("font-family: Poppins, sans-serif; font-weight: 700; font-size: 20px")}>pmrfp.com</span></div>
            <div style={s("color: #C9CCE6; font-size: 15px; margin-top: 14px")}>Built in Toronto by the team behind PermitClub, in partnership with Talkerstein Consulting Group.</div>
            <div style={s("color: #C9CCE6; font-size: 15px; margin-top: 6px")}>5050 Dufferin St., Toronto, ON M3H 5T5</div>
            <nav style={s("margin-top: 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px")}>
              {FOOTER_MOBILE.map(([l, h]) => <a key={l} href={h} style={s("color: #C9CCE6; text-decoration: none; min-height: 44px; display: flex; align-items: center; font-size: 15px")}>{l}</a>)}
            </nav>
            <div style={s("margin-top: 20px; padding-top: 18px; border-top: 1px solid #2E3160; font-size: 13px; color: #C9CCE6")}>PMRFP is a platform for posting RFPs and finding trades. We do not guarantee project availability, bid success, contract awards or revenue.</div>
          </footer>

          <div style={s("position: sticky; bottom: 0; z-index: 40; background: #1B1D3A; color: #FFFFFF; padding: 10px 12px; display: flex; align-items: center; gap: 10px; box-shadow: 0 -8px 24px rgba(20,22,58,0.25)")}>
            <div style={s("flex-grow: 1; min-width: 0")}><div style={s("font-weight: 700; font-size: 15px; line-height: 1.2")}>{data.open} open contracts</div><div style={s("font-size: 13px; color: #91F2CF")}>{data.closing7} close in 7 days</div></div>
            <button type="button" onClick={openModal} style={s("font: inherit; border: 0; background: #91F2CF; color: #1B1D3A; font-weight: 700; border-radius: 999px; height: 48px; padding: 0 20px; cursor: pointer; white-space: nowrap")}>Get matching RFPs</button>
          </div>
          {toast("position: fixed; left: 12px; right: 12px; bottom: 80px; max-width: 351px; z-index: 45; box-sizing: border-box; background: #FFFFFF; border: 2px solid #1B1D3A; border-radius: 18px; padding: 14px 44px 14px 16px; box-shadow: 0 14px 30px rgba(27,29,58,0.25)")}
          {modal && (
            <div onClick={(e) => e.target === e.currentTarget && closeModal()} style={s("position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 60; background: rgba(20,22,58,0.6); display: flex; align-items: flex-end; justify-content: center")}>
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Free weekly tender digest" style={s("position: relative; width: 100%; max-width: 480px; box-sizing: border-box; background: #FFFFFF; border-radius: 26px 26px 0 0; padding: 30px 20px 26px")}>
                {closeBtn}
                {popupBody("26px")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
