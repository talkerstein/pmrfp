"use client";

/**
 * Homepage — v2. Ported from the Claude Design handoff
 * (PMRFP Homepage v2.html + home-trade-sim.jsx + home-sections.jsx).
 * Audience-flip hero + animated sims, live opportunity board, "one loop"
 * pipeline, audience split and the $249 pricing/ROI block. Renders inside
 * the site's existing SiteHeader / SiteFooter chrome.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./pmrfp-v2.css";
import { DxCheck, Rv, FinalCta, DisclaimerStrip, usePrefersReducedMotion } from "./shared";
import { HxTradeSim, PwHeroSim } from "./sims";

/* ============================================================
   LIVE OPPORTUNITY BOARD
   ============================================================ */
const HX_BOARD = [
  { cat: "Electrical", title: "Condominium Electrical Maintenance Contract", sum: "Annual preventive maintenance and on-call service, 24-storey tower.", region: "Toronto, ON", prop: "Condominium", due: "Jun 18", status: "Open" },
  { cat: "Snow Removal", title: "Commercial Plaza Snow Removal Services", sum: "Seasonal clearing, salting, and sidewalks — 6-unit plaza + lot.", region: "Mississauga, ON", prop: "Retail plaza", due: "Jun 09", status: "Closing" },
  { cat: "HVAC", title: "Apartment Building HVAC Preventive Maintenance", sum: "Quarterly PM program across three mid-rise buildings.", region: "Ottawa, ON", prop: "Multi-res", due: "Jun 27", status: "Open" },
  { cat: "Concrete & Asphalt", title: "Retail Parking Lot Asphalt Repair", sum: "Crack sealing, pothole repair, line repainting — high-traffic lot.", region: "Hamilton, ON", prop: "Retail plaza", due: "Jul 02", status: "Open" },
  { cat: "Janitorial", title: "Multi-Residential Cleaning Services Contract", sum: "Daily common-area janitorial across a 180-unit portfolio.", region: "North York, ON", prop: "Multi-res", due: "Jun 30", status: "Open" },
  { cat: "Fire Safety", title: "High-Rise Fire Safety Inspection Program", sum: "Annual alarm, sprinkler & extinguisher certification — condo corp.", region: "Vaughan, ON", prop: "Condominium", due: "Jun 12", status: "Closing" },
];
const HX_CATS = ["All trades", "Electrical", "HVAC", "Snow Removal", "Janitorial", "Concrete & Asphalt", "Fire Safety"];

function HxBoard() {
  const [cat, setCat] = useState("All trades");
  const rows = HX_BOARD.filter((r) => cat === "All trades" || r.cat === cat);
  return (
    <div>
      <div className="hx-chips">
        {HX_CATS.map((c) => (
          <button key={c} className={"hx-chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>
            {c}
            <span className="n">{c === "All trades" ? HX_BOARD.length : HX_BOARD.filter((r) => r.cat === c).length}</span>
          </button>
        ))}
      </div>
      <div className="hx-board">
        <div className="hx-bcols">
          <span>Trade</span><span>Opportunity</span><span /><span>Region</span><span>Closes</span><span />
        </div>
        {rows.map((r) => (
          <Link className="hx-brow" href="/rfps" key={r.title}>
            <span className="cat">{r.cat}</span>
            <span style={{ minWidth: 0 }}>
              <span className="bt2" style={{ display: "block" }}>{r.title}</span>
              <span className="bs" style={{ display: "block" }}>{r.sum}</span>
            </span>
            <span className="bm">{r.prop}</span>
            <span className="bm">{r.region}</span>
            <span className="bm">{r.due}<small>{r.status}</small></span>
            <span className="lock">🔒 Members only →</span>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="hx-bempty">No open opportunities in this category right now — members get an alert the moment one lands.</div>
        )}
      </div>
      <div className="hx-bfoot">
        <span className="note">SAMPLE OPPORTUNITIES — FULL SCOPE, DOCUMENTS &amp; CONTACTS UNLOCK WITH MEMBERSHIP</span>
        <Link className="btn btn-primary btn-sm" href="/rfps">Browse all RFPs →</Link>
      </div>
    </div>
  );
}

/* ============================================================
   PIPELINE (how it works)
   ============================================================ */
const HX_NODES = [
  { who: "Property manager", title: "Posts the work", desc: "One short form — scope, building, region, deadline. Free.", icon: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" },
  { who: "PMRFP", title: "Hits the board", desc: "The RFP goes live on one filterable, Canada-wide board.", icon: "M3 3h18v18H3zM3 9h18M9 21V9" },
  { who: "PMRFP", title: "Matched trades alerted", desc: "Companies covering that trade and region get notified instantly.", icon: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
  { who: "Trade company", title: "Connects & wins", desc: "Structured interest, side-by-side comparison, intro accepted.", icon: "M20 6 9 17l-5-5" },
];
const HX_PIPE_DUR = 8;

function HxPipeline({ motion = "full" }: { motion?: "full" | "calm" }) {
  const reduced = usePrefersReducedMotion();
  const calm = motion === "calm" || reduced;
  const ref = useRef<HTMLDivElement>(null);
  const [inV, setInV] = useState(false);
  const [fRaw, setF] = useState(0);
  const t0 = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          setInV(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (calm || !inV) return;
    t0.current = Date.now();
    const iv = setInterval(() => {
      const p = (((Date.now() - t0.current) / 1000) % (HX_PIPE_DUR + 1.6)) / HX_PIPE_DUR;
      setF(Math.min(1, p));
    }, 120);
    return () => clearInterval(iv);
  }, [inV, calm]);

  const f = calm ? 0.99 : fRaw;
  const active = Math.min(3, Math.floor(f * 4));
  return (
    <div className="hx-pipe" ref={ref}>
      <div className="hx-track">
        <span className="fill" style={{ width: f * 100 + "%" }} />
        <span className="puck" style={{ left: f * 100 + "%" }} />
      </div>
      <div className="hx-nodes">
        {HX_NODES.map((n, i) => (
          <div key={n.title} className={"hx-node" + (i === active ? " on" : "") + (i < active ? " past" : "")}>
            <span className="dot2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
            </span>
            <h3>{n.title}</h3>
            <p>{n.desc}</p>
            <div className="who">{n.who}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   AUDIENCE SPLIT
   ============================================================ */
function HxAudience() {
  const chk = <span className="chk2"><DxCheck /></span>;
  return (
    <div className="hx-aud">
      <Rv className="hx-acard trade">
        <span className="tag2">For trade companies</span>
        <h3>Stop being the best-kept secret in your trade.</h3>
        <p>Commercial work moves through preferred-vendor lists you can&apos;t see. Get on the board where the buildings post.</p>
        <ul className="hx-alist">
          <li>{chk}A credible, verified profile in the directory buyers search</li>
          <li>{chk}RFP alerts matched to your trade &amp; regions</li>
          <li>{chk}Express interest in two clicks — track every submission</li>
        </ul>
        <div className="foot2">
          <Link className="btn btn-teal" href="/for-trades">For trades <span className="arrow">→</span></Link>
          <span className="price">$249 / YEAR · EARLY-BIRD</span>
        </div>
      </Rv>
      <Rv d={1} className="hx-acard pm">
        <span className="tag2">For property managers &amp; owners</span>
        <h3>Three bids without touching the phone.</h3>
        <p>Post once, free. Verified trades come to you with comparable bids — your details stay private until you&apos;re ready.</p>
        <ul className="hx-alist">
          <li>{chk}Post a project in about 8 minutes — free, no account to browse</li>
          <li>{chk}Anonymous by default, no obligation to hire</li>
          <li>{chk}Compare structured bids side by side</li>
        </ul>
        <div className="foot2">
          <Link className="btn btn-primary" href="/for-property-managers">For property managers <span className="arrow">→</span></Link>
          <span className="price">FREE — FOREVER</span>
        </div>
      </Rv>
    </div>
  );
}

/* ============================================================
   PRICING + ROI
   ============================================================ */
function HxPricing() {
  const [job, setJob] = useState(15000);
  const pct = Math.max(0.1, Math.round((249 / job) * 1000) / 10);
  const fmtMoney = (n: number) => "$" + n.toLocaleString("en-CA");
  const chk = <span className="chk2"><DxCheck /></span>;

  return (
    <div className="hx-price">
      <div className="hx-pcard">
        <span className="tag2">Early-bird · Trade Pro</span>
        <div className="amt">$249<small>CAD / year</small></div>
        <div className="was">LOCKS IN BEFORE IT RISES TO <s>$399</s></div>
        <ul className="hx-pfeat">
          <li>{chk}Directory listing + verified badge</li>
          <li>{chk}Full RFP access &amp; matching alerts</li>
          <li>{chk}Express interest, unlimited</li>
          <li>{chk}No per-lead fees. No commissions.</li>
        </ul>
        <Link className="btn btn-teal" href="/sign-up">Join as a Trade Company <span className="arrow">→</span></Link>
        <div className="fine">CANCEL ANYTIME · ACCESS RUNS TO END OF BILLING PERIOD</div>
      </div>
      <div className="hx-roi">
        <h3>Put $249 next to your numbers.</h3>
        <div className="note">What&apos;s a typical commercial job worth to your company?</div>
        <div className="pwc-row">
          <div className="lab"><span>Typical job value</span><span className="v">{fmtMoney(job)}</span></div>
          <input type="range" min={2000} max={100000} step={1000} value={job} onChange={(e) => setJob(+e.target.value)} />
          <div className="sub">SERVICE CALL → SEASONAL CONTRACT → CAPITAL PROJECT</div>
        </div>
        <div className="hx-roibig">
          <div className="v">{pct}%</div>
          <div className="k">of one {fmtMoney(job)} job = your whole year of membership</div>
        </div>
        <div className="fine">A COMPARISON OF COSTS, NOT A PROMISE OF WORK — PMRFP PROVIDES VISIBILITY AND RFP ACCESS, NOT GUARANTEED CONTRACTS.</div>
      </div>
    </div>
  );
}

/* ============================================================
   HERO (audience flip)
   ============================================================ */
type Aud = "trade" | "pm";
const HX_COPY: Record<Aud, { h1: ReactNode; sub: string; cta1: [string, string]; cta2: [string, string]; note: string }> = {
  trade: {
    h1: <>The work finds <span className="hl">you.</span></>,
    sub: "Commercial property RFPs across Canada, matched to your trade and region. Get listed once — opportunities land in your inbox, not your competitor's.",
    cta1: ["Join as a Trade Company", "/sign-up"],
    cta2: ["See live RFPs ↓", "#board"],
    note: "$249 / YEAR EARLY-BIRD — NO PER-LEAD FEES, NO COMMISSIONS",
  },
  pm: {
    h1: <>Stop chasing quotes. Start <span className="hl">choosing</span> them.</>,
    sub: "Post your building's project once — free. Verified trades across your region come to you with comparable bids.",
    cta1: ["Post your project free", "/for-property-managers"],
    cta2: ["How it works ↓", "#how"],
    note: "FREE FOR PROPERTY MANAGERS — TRADES PAY, YOU DON'T",
  },
};

export function HomeV2() {
  const [aud, setAud] = useState<Aud>("trade");
  const c = HX_COPY[aud];

  return (
    <div className="pmrfp-v2 pw dx" data-motion="full">
      <section className="pw-hero">
        <div className="dx-wrap">
          <div className="hx-hero-copy">
            <div className="hx-seg" role="tablist">
              <button className={aud === "trade" ? "on" : ""} onClick={() => setAud("trade")}>I do the work</button>
              <button className={aud === "pm" ? "on" : ""} onClick={() => setAud("pm")}>I manage buildings</button>
            </div>
            <h1 style={{ marginTop: 26 }}>{c.h1}</h1>
            <p className="sub">{c.sub}</p>
            <div className="pw-cta">
              <Link className="btn btn-teal btn-lg" href={c.cta1[1]}>{c.cta1[0]} <span className="arrow">→</span></Link>
              <Link className="btn btn-outline-light" href={c.cta2[1]}>{c.cta2[0]}</Link>
            </div>
            <div className="pw-note"><span className="dot" />{c.note}</div>
          </div>
          {aud === "trade" ? <HxTradeSim /> : <PwHeroSim scenario="Roofing" />}
        </div>
      </section>

      <div className="pw-strip">
        <div className="dx-wrap">
          <span className="it"><span className="dot" />Canada-first · GTA focus</span>
          <span className="it"><span className="dot" />Commercial property only</span>
          <span className="it"><span className="dot" />Verified, insured trades</span>
          <span className="it"><span className="dot" />Free for property managers</span>
        </div>
      </div>

      <section className="pw-sec" id="board">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">The opportunity board</span>
            <h2>This is what&apos;s open right now.</h2>
            <p>Every commercial property RFP in one filterable board — tap a trade to see what your week could look like.</p>
          </Rv>
          <HxBoard />
        </div>
      </section>

      <section className="pw-sec soft" id="how">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">How it works</span>
            <h2>One loop. Both sides win.</h2>
            <p>Work gets posted, matched, and connected — watch it move.</p>
          </Rv>
          <HxPipeline />
          <HxAudience />
        </div>
      </section>

      <section className="pw-sec" id="pricing">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">Pricing</span>
            <h2>One flat price. Do the math on it.</h2>
          </Rv>
          <HxPricing />
        </div>
      </section>

      <FinalCta
        title="Get listed before your competitors do."
        sub="Early trade members lock in $249/yr and a head start on every board we open next."
        primary="Join as a Trade Company"
        primaryHref="/sign-up"
        secondary="Post an RFP — free"
        secondaryHref="/sign-up?role=property_manager"
      />

      <DisclaimerStrip>
        PMRFP is a vendor discovery and RFP visibility platform. We do not guarantee project
        availability, bid success, contract awards, property-manager response, or revenue. Members are
        responsible for their own due diligence, qualifications, insurance, licensing, pricing, and
        agreements.
      </DisclaimerStrip>
    </div>
  );
}
