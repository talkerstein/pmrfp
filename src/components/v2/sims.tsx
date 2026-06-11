"use client";

/**
 * Auto-playing hero simulations, ported 1:1 from the Claude Design handoff
 * (pm-hero-sim.jsx + home-trade-sim.jsx). Real-time loops driven by a
 * setInterval clock; they jump straight to the end state for reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { DxCheck, DxVChip, usePrefersReducedMotion } from "./shared";

type Mono = [string, string];

type Scenario = {
  title: string;
  chips: string[];
  matched: number;
  monos: Mono[];
  bids: { mono: string; color: string; name: string; v: boolean; msg: string; t: string }[];
  tally: [string, string, string];
};

export const PW_SCENARIOS: Record<string, Scenario> = {
  Roofing: {
    title: "Flat roof leak repair — 12-storey condo",
    chips: ["Roofing", "North York, ON", "Condominium", "Site visit required"],
    matched: 9,
    monos: [["IR", "var(--indigo-500)"], ["SP", "var(--teal-ink)"], ["NR", "var(--periwinkle)"], ["AA", "var(--indigo-500)"], ["VG", "var(--teal-ink)"]],
    bids: [
      { mono: "IR", color: "var(--indigo-500)", name: "IronClad Roofing", v: true, msg: "Can site-visit Thursday morning.", t: "2 hrs in" },
      { mono: "SP", color: "var(--teal-ink)", name: "Summit Peak Roofing", v: true, msg: "Quote attached — repair vs. overlay options.", t: "Day 1" },
      { mono: "NR", color: "var(--periwinkle)", name: "Northern Roof Systems", v: false, msg: "Question about roof access.", t: "Day 2" },
    ],
    tally: ["3 responses", "0 cold calls made", "38 hrs since posting"],
  },
  HVAC: {
    title: "Rooftop unit replacement — office building",
    chips: ["HVAC", "Mississauga, ON", "Office", "Budget on request"],
    matched: 7,
    monos: [["SM", "var(--periwinkle)"], ["CC", "var(--teal-ink)"], ["NS", "var(--indigo-500)"], ["ME", "var(--periwinkle)"], ["GF", "var(--teal-ink)"]],
    bids: [
      { mono: "SM", color: "var(--periwinkle)", name: "Summit Mechanical", v: true, msg: "We service 14 buildings nearby — quote attached.", t: "3 hrs in" },
      { mono: "CC", color: "var(--teal-ink)", name: "Capital Climate Co.", v: true, msg: "Two RTU options, install in 3 weeks.", t: "Day 1" },
      { mono: "NS", color: "var(--indigo-500)", name: "NorthSupply Co.", v: true, msg: "Equipment quote for the RTU swap.", t: "Day 1" },
    ],
    tally: ["3 responses", "0 cold calls made", "26 hrs since posting"],
  },
  Snow: {
    title: "Seasonal snow & ice contract — 3 plazas",
    chips: ["Snow Removal", "Vaughan, ON", "Retail plaza", "Season 2026–27"],
    matched: 6,
    monos: [["GS", "var(--periwinkle)"], ["GL", "var(--indigo-500)"], ["MP", "var(--teal-ink)"], ["AA", "var(--periwinkle)"], ["PF", "var(--indigo-500)"]],
    bids: [
      { mono: "GS", color: "var(--periwinkle)", name: "GTA SnowPro", v: true, msg: "Route capacity available — per-cm or seasonal pricing.", t: "1 hr in" },
      { mono: "GL", color: "var(--indigo-500)", name: "Glacier Snow & Ice", v: false, msg: "Can include sidewalk crews for all 3 sites.", t: "Day 1" },
      { mono: "MP", color: "var(--teal-ink)", name: "Maple Property Care", v: true, msg: "Question about on-site salt storage.", t: "Day 2" },
    ],
    tally: ["3 responses", "0 cold calls made", "30 hrs since posting"],
  },
};

export function PwHeroSim({ scenario = "Roofing", motion = "full" }: { scenario?: string; motion?: "full" | "calm" }) {
  const S = PW_SCENARIOS[scenario] ?? PW_SCENARIOS.Roofing;
  const reduced = usePrefersReducedMotion();
  const calm = motion === "calm" || reduced;

  const T = useMemo(() => {
    const typeDur = S.title.length * 0.028;
    const tType = 0.5;
    const tChips = tType + typeDur + 0.35;
    const tPress = tChips + S.chips.length * 0.3 + 0.55;
    const tLive = tPress + 0.35;
    const tMatch = tLive + 0.55;
    const tBids = tMatch + S.monos.length * 0.22 + 0.9;
    const tTally = tBids + S.bids.length * 1.05 + 0.75;
    const tEnd = tTally + 4.2;
    return { tType, tChips, tPress, tLive, tMatch, tBids, tTally, tEnd };
  }, [S]);

  const [eRaw, setE] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    if (calm) return;
    t0.current = Date.now();
    const iv = setInterval(() => {
      const el = (Date.now() - t0.current) / 1000;
      if (el >= T.tEnd) {
        t0.current = Date.now();
        setE(0);
      } else {
        setE(el);
      }
    }, 80);
    return () => clearInterval(iv);
  }, [T, calm, scenario]);

  // when motion is calm, render the resolved end-state directly
  const e = calm ? T.tTally + 1 : eRaw;

  const replay = () => {
    t0.current = Date.now();
    setE(0);
  };

  const typed = Math.max(0, Math.min(S.title.length, Math.floor((e - T.tType) / 0.028)));
  const typing = e >= T.tType && typed < S.title.length;
  const live = e >= T.tLive;
  const pressed = e >= T.tPress && e < T.tLive + 0.25;

  return (
    <div className="pw-sim">
      <div className="ps-bar">
        <span className="tl"><i /><i /><i /></span>
        <span className="addr">pmrfp.com/post</span>
        {!calm && <button className="replay" onClick={replay}>↺ Replay</button>}
      </div>
      <div className="ps-body">
        <div className={"ps-rfp" + (live ? " live" : "")}>
          <div className="k">
            <span>{live ? "Your RFP" : "New RFP — takes about 8 minutes"}</span>
            {live && <span className="pill-live"><span className="dot" />Live</span>}
          </div>
          <div className="title">
            {S.title.slice(0, typed)}
            {typing && <span className="caret" />}
          </div>
          <div className="chips">
            {S.chips.map((c, i) => (
              <span key={c} className={"ps-chip" + (e >= T.tChips + i * 0.3 ? " on" : "")}>{c}</span>
            ))}
          </div>
          {!live && (
            <div className="ps-pub">
              <span className={"btn btn-teal btn-sm" + (pressed ? " pressed" : "")} style={{ opacity: e >= T.tChips ? 1 : 0.35 }}>Post free</span>
            </div>
          )}
        </div>

        <div className={"ps-match" + (e >= T.tMatch ? " on" : "")}>
          <div className="k">Notifying matching verified trades</div>
          <div className="mrow">
            {S.monos.map(([m, c], i) => (
              <span key={i} className={"dx-mg" + (e >= T.tMatch + 0.25 + i * 0.22 ? " lit" : "")} style={{ background: c }}>{m}</span>
            ))}
            <span className="mn">+{S.matched - S.monos.length} more matched</span>
          </div>
        </div>

        {S.bids.map((b, i) => (
          <div key={b.name} className={"ps-bid" + (e >= T.tBids + i * 1.05 ? " on" : "")}>
            <span className="dx-mg" style={{ background: b.color }}>{b.mono}</span>
            <span>
              <span className="bn">{b.name}{b.v && <DxVChip />}</span>
              <span className="bm" style={{ display: "block" }}>{b.msg}</span>
            </span>
            <span className="bt">{b.t}</span>
          </div>
        ))}

        <div className={"ps-tally" + (e >= T.tTally ? " on" : "")}>
          <span className="tv">{S.tally[0]}</span>
          <span className="tk">· {S.tally[1]}</span>
          <span className="tz">{S.tally[2]}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- trade-side hero sim (homepage) ---------- */
const HX_OPS = [
  { cat: "Electrical", title: "Condo Electrical Maintenance Contract", meta: "Toronto · Condominium · closes Jun 18" },
  { cat: "Snow", title: "Commercial Plaza Snow Removal", meta: "Mississauga · Retail · closes Jun 09" },
  { cat: "HVAC", title: "Apartment HVAC Preventive Maintenance", meta: "Ottawa · Multi-res · closes Jun 27" },
];
const HX_MATCH = { cat: "Roofing", title: "Flat Roof Leak Repair — 12-Storey Condo", meta: "North York · Condominium · posted just now" };

export function HxTradeSim({ motion = "full" }: { motion?: "full" | "calm" }) {
  const reduced = usePrefersReducedMotion();
  const calm = motion === "calm" || reduced;

  const T = useMemo(
    () => ({ ops: 0.5, match: 2.2, btn: 3.4, press: 4.6, status: 5.0, end: 12.5 }),
    [],
  );

  const [eRaw, setE] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    if (calm) return;
    t0.current = Date.now();
    const iv = setInterval(() => {
      const el = (Date.now() - t0.current) / 1000;
      if (el >= T.end) {
        t0.current = Date.now();
        setE(0);
      } else {
        setE(el);
      }
    }, 80);
    return () => clearInterval(iv);
  }, [T, calm]);

  const e = calm ? T.status + 3 : eRaw;

  const replay = () => {
    t0.current = Date.now();
    setE(0);
  };
  const pressed = e >= T.press && e < T.press + 0.3;
  const sent = e >= T.press;
  const steps: [string, number][] = [
    ["Interest sent", T.status],
    ["PM viewed profile", T.status + 1.4],
    ["Intro accepted", T.status + 2.8],
  ];

  return (
    <div className="pw-sim">
      <div className="ps-bar">
        <span className="tl"><i /><i /><i /></span>
        <span className="addr">pmrfp.com/rfps</span>
        {!calm && <button className="replay" onClick={replay}>↺ Replay</button>}
      </div>
      <div className="ps-body">
        <div className="hx-profile">
          <span className="dx-mg" style={{ background: "var(--indigo-500)" }}>IR</span>
          <span>
            <span className="pn">IronClad Roofing — that&apos;s you <DxVChip /></span>
            <span className="pm2" style={{ display: "block" }}>ROOFING · GTA · ALERTS ON</span>
          </span>
        </div>

        {HX_OPS.map((o, i) => (
          <div key={o.title} className={"hx-op" + (e >= T.ops + i * 0.35 ? " on" : "")}>
            <span className="cat">{o.cat}</span>
            <span style={{ minWidth: 0 }}>
              <span className="ot" style={{ display: "block" }}>{o.title}</span>
              <span className="om" style={{ display: "block" }}>{o.meta}</span>
            </span>
          </div>
        ))}

        <div className={"hx-op" + (e >= T.match ? " on match" : "")}>
          <span className="cat">{HX_MATCH.cat}</span>
          <span style={{ minWidth: 0 }}>
            <span className="ot" style={{ display: "block" }}>{HX_MATCH.title}</span>
            <span className="om" style={{ display: "block" }}>{HX_MATCH.meta}</span>
          </span>
          <span className="new"><span className="mtag">Matches you</span></span>
        </div>

        {!sent && (
          <div className="hx-interest" style={{ opacity: e >= T.btn ? 1 : 0, transition: "opacity .4s" }}>
            <span className={"btn btn-teal btn-sm" + (pressed ? " pressed" : "")}>Express interest</span>
          </div>
        )}

        <div className={"hx-status" + (sent ? " on" : "")}>
          {steps.map(([label, at], i) => (
            <span key={label} style={{ display: "contents" }}>
              {i > 0 && <span className={"bar2" + (e >= at ? " done" : "")}><i /></span>}
              <span className={"st" + (e >= at ? " done" : "")}>
                <span className="b"><DxCheck /></span>
                {label}
              </span>
            </span>
          ))}
        </div>

        <div className={"ps-tally" + (e >= T.status + 2.8 ? " on" : "")}>
          <span className="tv">Connected</span>
          <span className="tk">· contact shared both ways</span>
          <span className="tz">0 COLD CALLS</span>
        </div>
      </div>
    </div>
  );
}
