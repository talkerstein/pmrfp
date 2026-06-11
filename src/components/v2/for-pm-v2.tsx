"use client";

/**
 * "For Property Managers" — v2 interactive page.
 * Ported from the Claude Design handoff (PMRFP For Property Managers v2.html
 * + pm-demo.jsx + pm-sections.jsx + pm-hero-sim.jsx). Renders inside the
 * site's existing SiteHeader / SiteFooter chrome.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./pmrfp-v2.css";
import { DxCheck, DxVChip, Rv, FinalCta, DisclaimerStrip, usePrefersReducedMotion } from "./shared";
import { PwHeroSim } from "./sims";

/* ============================================================
   INTERACTIVE DEMO — post an RFP in ~60s
   ============================================================ */
const PWD_CATS: [string, string, number][] = [
  ["Roofing", "e.g. IronClad Roofing", 9],
  ["HVAC", "e.g. Summit Mechanical", 7],
  ["Electrical", "e.g. Mercer Electric", 8],
  ["Snow Removal", "e.g. GTA SnowPro", 6],
  ["Janitorial", "e.g. PureClean Facility", 8],
  ["Fire Safety", "e.g. Guardian Fire & Safety", 5],
  ["Glass & Windows", "e.g. Northview Windows", 10],
  ["Pest Control", "e.g. Pest Control Plus", 4],
];
const PWD_TITLES: Record<string, string> = {
  Roofing: "Flat roof leak repair",
  HVAC: "Rooftop unit replacement",
  Electrical: "Common-area lighting retrofit",
  "Snow Removal": "Seasonal snow & ice contract",
  Janitorial: "Daily common-area cleaning contract",
  "Fire Safety": "Annual fire alarm inspection",
  "Glass & Windows": "Lobby glass door replacement",
  "Pest Control": "Quarterly pest control program",
};
const PWD_PROPS = ["Multi-residential", "Condominium", "Office", "Retail plaza", "Industrial", "Mixed-use"];
const PWD_REGIONS = ["Toronto", "North York", "Mississauga", "Vaughan", "Markham", "Hamilton", "Ottawa"];
const PWD_TIMING: [string, string][] = [
  ["ASAP", "urgent — days"],
  ["2–4 weeks", "standard tender"],
  ["Flexible", "planning ahead"],
];
const PWD_MONOS: [string, string][] = [
  ["IR", "var(--indigo-500)"],
  ["SM", "var(--periwinkle)"],
  ["ME", "var(--teal-ink)"],
  ["GS", "var(--indigo-500)"],
  ["PC", "var(--periwinkle)"],
];

function PwDemo() {
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [prop, setProp] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [timing, setTiming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [posted, setPosted] = useState(false);

  const matched = cat ? PWD_CATS.find((c) => c[0] === cat)![2] : 0;
  const pickCat = (c: string) => {
    setCat(c);
    setTitle(PWD_TITLES[c]);
  };
  const canNext = step === 0 ? !!cat : step === 1 ? !!prop && !!region : !!title.trim() && !!timing;
  const reset = () => {
    setStep(0);
    setCat(null);
    setProp(null);
    setRegion(null);
    setTiming(null);
    setTitle("");
    setPosted(false);
  };
  const stepLabel = ["Trade", "Building", "Details"];

  return (
    <div className="pw-demo">
      <div className="pwd-card">
        {posted ? (
          <div className="pwd-done">
            <span className="big"><DxCheck /></span>
            <h3>Your RFP is live.</h3>
            <p>
              {matched} verified {cat?.toLowerCase()} trades in {region} just got notified. Bids land
              in your inbox — compare and reply only to the ones you like.
            </p>
            <div className="mrow">
              {PWD_MONOS.slice(0, 4).map(([m, c], i) => (
                <span key={i} className="dx-mg" style={{ background: c, animationDelay: 0.15 + i * 0.1 + "s" }}>{m}</span>
              ))}
            </div>
            <button className="reset" onClick={reset}>↺ TRY ANOTHER PROJECT</button>
          </div>
        ) : (
          <>
            <div className="pwd-steps">
              {stepLabel.map((s, i) => (
                <div key={s} className={"pwd-step" + (i === step ? " on" : "") + (i < step ? " done" : "")}>
                  <span className="n">{i < step ? "✓" : i + 1}</span>
                  <span>{s}</span>
                  {i < 2 && <span className="bar" />}
                </div>
              ))}
            </div>

            {step === 0 && (
              <>
                <div className="pwd-q">What does the building need?</div>
                <div className="pwd-grid">
                  {PWD_CATS.map(([c, eg]) => (
                    <button key={c} className={"pwd-opt" + (cat === c ? " sel" : "")} onClick={() => pickCat(c)}>
                      {c}
                      <span className="s">{eg}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="pwd-q">What kind of building, and where?</div>
                <div className="pwd-grid cols3">
                  {PWD_PROPS.map((p) => (
                    <button key={p} className={"pwd-opt" + (prop === p ? " sel" : "")} onClick={() => setProp(p)}>{p}</button>
                  ))}
                </div>
                <div className="pwd-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 12 }}>
                  {PWD_REGIONS.map((r) => (
                    <button key={r} className={"pwd-opt" + (region === r ? " sel" : "")} style={{ padding: "10px 12px" }} onClick={() => setRegion(r)}>{r}</button>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="pwd-q">Name it, and set a pace.</div>
                <input className="pwd-input" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Project title…" />
                <div className="pwd-grid cols3">
                  {PWD_TIMING.map(([t, s]) => (
                    <button key={t} className={"pwd-opt" + (timing === t ? " sel" : "")} onClick={() => setTiming(t)}>
                      {t}
                      <span className="s">{s}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="pwd-foot">
              {step > 0 && <button className="back" onClick={() => setStep(step - 1)}>← Back</button>}
              <span className="hint">{step === 0 && cat ? matched + " verified trades match" : ""}</span>
              <button
                className="btn btn-primary btn-sm"
                style={{ opacity: canNext ? 1 : 0.4, pointerEvents: canNext ? "auto" : "none" }}
                onClick={() => (step < 2 ? setStep(step + 1) : setPosted(true))}
              >
                {step < 2 ? "Next →" : "Post it — free"}
              </button>
            </div>
          </>
        )}
      </div>

      <aside className="pwd-side">
        <div className="k">Live preview — what trades see</div>
        <div className="ps-rfp">
          <div className="k">
            <span>RFP · {region || "Region"}</span>
            {posted && <span className="pill-live"><span className="dot" />Live</span>}
          </div>
          <div className="title">{title || "Your project title"}</div>
          <div className="chips">
            {[cat, prop, region, timing].filter(Boolean).map((c) => (
              <span key={c} className="ps-chip on">{c}</span>
            ))}
            {![cat, prop, region, timing].some(Boolean) && (
              <span className="ps-chip on" style={{ opacity: 0.45 }}>Your selections appear here</span>
            )}
          </div>
        </div>
        <p className="meta">
          {cat ? (
            <span>
              <b>{matched}</b> verified {cat.toLowerCase()} trades would be notified.
              <br />
            </span>
          ) : (
            <span>
              Pick a trade to see who gets notified.
              <br />
            </span>
          )}
          Your contact details stay hidden until <b>you</b> choose to share them. No obligation to hire.
        </p>
      </aside>
    </div>
  );
}

/* ============================================================
   RACE — phone-around vs PMRFP
   ============================================================ */
const PWR_OLD: [number, string, string][] = [
  [0.06, "Day 1", "Pull last year's contact list — half the numbers are stale."],
  [0.18, "Day 2", "Call 6 roofers. Reach 2. Leave 4 voicemails."],
  [0.34, "Day 4", "One callback. Email the spec. Wait."],
  [0.5, "Day 7", "Chase the others. Re-explain the scope. Twice."],
  [0.68, "Day 10", "Second quote arrives — for the wrong scope."],
  [0.86, "Day 14", "Still waiting on quote #3."],
];
const PWR_NEW: [number, string, string][] = [
  [0.05, "Min 0", "Post the RFP once — scope, building, deadline."],
  [0.16, "Min 8", "Matching verified trades notified automatically."],
  [0.28, "Hr 2", "First response: site visit offered."],
  [0.42, "Day 1", "Quote #2 arrives — attached, right scope."],
  [0.56, "Day 2", "Quote #3. Compare side by side, reply to the best."],
];
const PWR_DUR = 7.5;

function PwRace({ motion = "full" }: { motion?: "full" | "calm" }) {
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
      const p = (Date.now() - t0.current) / 1000 / PWR_DUR;
      setF(Math.min(1, p));
      if (p >= 1) clearInterval(iv);
    }, 70);
    return () => clearInterval(iv);
  }, [inV, calm]);

  const f = calm ? 1 : fRaw;

  const replay = () => {
    t0.current = Date.now();
    setF(0);
    const iv = setInterval(() => {
      const p = (Date.now() - t0.current) / 1000 / PWR_DUR;
      setF(Math.min(1, p));
      if (p >= 1) clearInterval(iv);
    }, 70);
  };

  const oldDay = Math.max(1, Math.ceil(f * 14));
  const newHrs = Math.min(48, Math.ceil((f / 0.7) * 48));
  const newDone = f >= 0.7;

  return (
    <div ref={ref}>
      <div className="pw-race">
        <div className="pwr-col old">
          <div className="pwr-head"><h3>The phone-around</h3><span className="tag">Status quo</span></div>
          <div className="pwr-clock">Day {oldDay}<small>OF 14 — AND COUNTING</small></div>
          <div className="pwr-track"><span className="fill" style={{ width: f * 100 + "%" }} /></div>
          <ul className="pwr-list">
            {PWR_OLD.map(([at, d, txt]) => (
              <li key={d} className={"pwr-it" + (f >= at ? " on" : "")}><span className="d">{d}</span><span>{txt}</span></li>
            ))}
          </ul>
          <div className={"pwr-end" + (f >= 0.97 ? " on" : "")}>Two weeks in: 2 usable quotes.</div>
        </div>
        <div className="pwr-col new">
          <div className="pwr-head"><h3>One post on PMRFP</h3><span className="tag">Same project</span></div>
          <div className="pwr-clock">{newDone ? "48 hrs" : "Hr " + newHrs}<small>{newDone ? "DONE — COMPARING BIDS" : "ELAPSED"}</small></div>
          <div className="pwr-track"><span className="fill" style={{ width: Math.min(100, (f / 0.7) * 100) + "%" }} /></div>
          <ul className="pwr-list">
            {PWR_NEW.map(([at, d, txt]) => (
              <li key={d} className={"pwr-it" + (f >= at ? " on" : "")}><span className="d">{d}</span><span>{txt}</span></li>
            ))}
          </ul>
          <div className={"pwr-end" + (f >= 0.72 ? " on" : "")}>48 hours: 3 comparable bids. Phone untouched.</div>
        </div>
      </div>
      {!calm && (
        <div className="pw-race-replay"><button onClick={replay}>↺ Run it again</button></div>
      )}
    </div>
  );
}

/* ============================================================
   CALCULATOR
   ============================================================ */
function PwCalc() {
  const [tenders, setTenders] = useState(12);
  const [quotes, setQuotes] = useState(3);
  const [calls, setCalls] = useState(4);

  const MIN_PER_CALL = 12;
  const MIN_PER_POST = 10;
  const oldH = (tenders * quotes * calls * MIN_PER_CALL) / 60;
  const newH = (tenders * MIN_PER_POST) / 60;
  const saved = Math.max(0, oldH - newH);
  const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

  return (
    <div className="pw-calc">
      <div className="pwc-in">
        <h3>Your numbers, not ours.</h3>
        <div className="note">Drag the sliders — the math updates live.</div>
        <div className="pwc-row">
          <div className="lab"><span>Projects you tender per year</span><span className="v">{tenders}</span></div>
          <input type="range" min={1} max={40} value={tenders} onChange={(e) => setTenders(+e.target.value)} />
          <div className="sub">CONTRACTS, REPAIRS, SEASONAL WORK</div>
        </div>
        <div className="pwc-row">
          <div className="lab"><span>Quotes you want per project</span><span className="v">{quotes}</span></div>
          <input type="range" min={2} max={5} value={quotes} onChange={(e) => setQuotes(+e.target.value)} />
          <div className="sub">MOST BOARDS &amp; OWNERS EXPECT 3</div>
        </div>
        <div className="pwc-row">
          <div className="lab"><span>Calls &amp; chases to land one quote</span><span className="v">{calls}</span></div>
          <input type="range" min={2} max={8} value={calls} onChange={(e) => setCalls(+e.target.value)} />
          <div className="sub">VOICEMAILS, CALLBACKS, RE-EXPLAINING SCOPE</div>
        </div>
      </div>
      <div className="pwc-out">
        <div className="k">Time on the phone you&apos;d skip</div>
        <div className="pwc-big">{fmt(saved)}<small>hrs / year</small></div>
        <div className="pwc-cmp">
          <div className="c"><div className="cv warn">{fmt(oldH)} hrs</div><div className="ck">Phone-around</div></div>
          <div className="c"><div className="cv good">{fmt(newH)} hrs</div><div className="ck">Posting on PMRFP</div></div>
          <div className="c"><div className="cv">{tenders * quotes * calls}</div><div className="ck">Calls you don&apos;t make</div></div>
        </div>
        <div className="pwc-fine">
          ASSUMES ~{MIN_PER_CALL} MIN PER CALL AND ~{MIN_PER_POST} MIN TO POST AN RFP. AN ESTIMATE OF
          EFFORT, NOT A PROMISE OF OUTCOMES — BIDS DEPEND ON YOUR PROJECT AND REGION.
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CONTROL CARDS
   ============================================================ */
function PwControl() {
  const [shared, setShared] = useState(false);
  const [declined, setDeclined] = useState(false);

  return (
    <div className="pw-ctrl">
      <Rv className="pwk-card">
        <h3>Anonymous until you say so.</h3>
        <p>Trades see the building&apos;s needs — not your name, number, or inbox. Share contact details per-bid, when you&apos;re ready.</p>
        <div className="pwk-demo">
          <label className="pwk-toggle" onClick={() => setShared(!shared)}>
            <span className={"dx-switch" + (shared ? "" : " off")} />
            <span className="lbl">Share my contact with bidders</span>
          </label>
          <div className="pwk-contact">
            <span className="dx-mg" style={{ background: "var(--periwinkle)" }}>YM</span>
            <span>
              <div className="cn">You, Property Manager</div>
              <div className={"cd" + (shared ? "" : " hidden2")}>you@yourportfolio.ca · (416) 555-0142</div>
            </span>
          </div>
        </div>
        <div className="pwk-stat">DEFAULT: HIDDEN — FLIP IT YOURSELF ↑</div>
      </Rv>
      <Rv d={1} className="pwk-card">
        <h3>No obligation. Ever.</h3>
        <p>A bid is an offer, not a commitment. Compare, ask questions, hire — or pass on all of them with one click.</p>
        <div className="pwk-demo">
          <div className="pwk-contact" style={{ marginTop: 0 }}>
            <span className="dx-mg" style={{ background: "var(--indigo-500)" }}>IR</span>
            <span>
              <div className="cn">IronClad Roofing — bid received</div>
              <div className="cd">{declined ? "Declined politely. They were notified." : "Quote attached · site visit offered"}</div>
            </span>
          </div>
          {!declined ? (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" style={{ padding: "8px 14px", fontSize: 12.5 }}>Accept intro</button>
              <button className="btn btn-outline btn-sm" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => setDeclined(true)}>Decline politely</button>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" style={{ padding: "8px 14px", fontSize: 12.5, marginTop: 14 }} onClick={() => setDeclined(false)}>↺ Undo</button>
          )}
        </div>
        <div className="pwk-stat">YOU OWE NOBODY A CALLBACK</div>
      </Rv>
      <Rv d={2} className="pwk-card">
        <h3>Verified means verified.</h3>
        <p>Trades on PMRFP hold the paperwork your board will ask about — checked before the badge goes on.</p>
        <div className="pwk-demo">
          {["Liability insurance on file", "WSIB clearance", "Trade licence — where required"].map((d) => (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", fontSize: 13, color: "var(--ink-2)" }}>
              <span style={{ width: 18, height: 18, borderRadius: 6, background: "var(--teal-100)", color: "var(--teal-ink)", display: "grid", placeItems: "center", flex: "none" }}>
                <span style={{ width: 10, height: 10, display: "grid" }}><DxCheck /></span>
              </span>
              {d}
            </div>
          ))}
          <div style={{ marginTop: 10 }}><DxVChip /></div>
        </div>
        <div className="pwk-stat">DUE DILIGENCE IS STILL YOURS — WE JUST START IT</div>
      </Rv>
    </div>
  );
}

/* ============================================================
   DIRECTORY BAND
   ============================================================ */
function PwDirBand() {
  const monos: [string, string][] = [
    ["ME", "var(--indigo-500)"],
    ["PC", "var(--teal-ink)"],
    ["DG", "var(--periwinkle)"],
    ["IR", "var(--indigo-500)"],
    ["SM", "var(--periwinkle)"],
    ["GF", "var(--teal-ink)"],
  ];
  return (
    <div className="pw-dirband">
      <span className="mrow">
        {monos.map(([m, c], i) => (
          <span key={i} className="dx-mg" style={{ background: c }}>{m}</span>
        ))}
      </span>
      <span>
        <div className="tt">Rather browse first? The directory is open.</div>
        <div className="ts">Every listed company, by category and region — no account needed.</div>
      </span>
      <Link className="btn btn-outline btn-sm" href="/directory">Browse the directory →</Link>
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export function ForPmV2() {
  return (
    <div className="pmrfp-v2 pw dx" data-motion="full">
      <section className="pw-hero">
        <div className="dx-wrap">
          <div>
            <span className="eyebrow">For property managers</span>
            <h1>Stop chasing quotes. Start <span className="hl">choosing</span> them.</h1>
            <p className="sub">Post your building&apos;s project once — free. Verified trades across your region come to you with comparable bids.</p>
            <div className="pw-cta">
              <Link className="btn btn-teal btn-lg" href="/sign-up?role=property_manager">Post your project free <span className="arrow">→</span></Link>
              <Link className="btn btn-outline-light" href="#try-it">Try the flow ↓</Link>
            </div>
            <div className="pw-note"><span className="dot" />FREE FOR PROPERTY MANAGERS — TRADES PAY, YOU DON&apos;T</div>
          </div>
          <PwHeroSim scenario="Roofing" />
        </div>
      </section>

      <div className="pw-strip">
        <div className="dx-wrap">
          <span className="it"><span className="dot" />Free for PMs — forever</span>
          <span className="it"><span className="dot" />Contact details hidden by default</span>
          <span className="it"><span className="dot" />No obligation to hire</span>
          <span className="it"><span className="dot" />Verified, insured trades</span>
        </div>
      </div>

      <section className="pw-sec" id="try-it">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">Try it</span>
            <h2>Post your first RFP right here.</h2>
            <p>This is the real flow — three steps, about 60 seconds. Nothing here is saved; it&apos;s just to show you how light it is.</p>
          </Rv>
          <PwDemo />
        </div>
      </section>

      <section className="pw-sec soft">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">The difference</span>
            <h2>Same project. Two very different weeks.</h2>
            <p>You&apos;ve lived the left column. Watch them run head-to-head.</p>
          </Rv>
          <PwRace />
        </div>
      </section>

      <section className="pw-sec">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">The math</span>
            <h2>What&apos;s the phone-around costing you?</h2>
          </Rv>
          <PwCalc />
        </div>
      </section>

      <section className="pw-sec soft">
        <div className="dx-wrap">
          <Rv className="pw-sechead">
            <span className="eyebrow">You&apos;re in control</span>
            <h2>Built for the person who answers to the board.</h2>
            <p>Every demo below is interactive — poke at it.</p>
          </Rv>
          <PwControl />
          <Rv><PwDirBand /></Rv>
        </div>
      </section>

      <FinalCta
        title="Your next project could be live in 8 minutes."
        sub="Post it free. If the bids aren't good, you've lost nothing — not even an afternoon of calls."
        primary="Post your project free"
        primaryHref="/sign-up?role=property_manager"
        secondary="Browse the directory"
        secondaryHref="/directory"
      />

      <DisclaimerStrip>
        PMRFP is a platform for posting RFPs and finding trades. We do not guarantee bid volume,
        response times, or outcomes. Members are responsible for their own due diligence,
        qualifications, insurance, licensing, pricing, and agreements.
      </DisclaimerStrip>
    </div>
  );
}
