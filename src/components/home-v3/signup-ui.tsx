import "@/components/v3-pages/directory.css";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Pieces of the "Signup flow" template shared by the sign-up page (client),
 * the check-email ("Done") page and onboarding (server). No hooks here.
 */

export const SmallTick = ({ stroke = "#1B1D3A", size = 12 }: { stroke?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
export const BigTick = ({ stroke = "#282B59", size = 18 }: { stroke?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke={stroke} strokeWidth="2.5" aria-hidden><path d="M4 11.5l4.5 4.5L18 6.5" /></svg>
);

/** Photo per account type (the same library photos as the homepage). */
export const ROLE_PHOTO: Record<string, string> = {
  trade: "/images/photos/electrical-panel-testing.webp",
  supplier: "/images/photos/warehouse-loading-docks.webp",
  property_manager: "/images/home/pm-lobby.webp",
  landlord: "/images/photos/retail-power-centre-aerial.webp",
  general_contractor: "/images/photos/site-crew-deck.webp",
  real_estate_agent: "/images/photos/keys-in-door.webp",
  talent: "/images/home/trade-hvac.webp",
  visitor: "/images/photos/condo-midrise.webp",
};

export function Stepper({ labels, step, onGo }: { labels: string[]; step: number; onGo?: (i: number) => void }) {
  const pct = ["0%", "33.4%", "66.7%", "100%"][Math.min(3, Math.max(0, step))];
  return (
    <div className="v3-su-steps">
      <div className="track" aria-hidden><div className="bar" style={{ width: pct }} /></div>
      <ol>
        {labels.map((l, i) => {
          const done = i < step;
          const cur = i === step;
          const can = !!onGo && done && step < 3;
          return (
            <li key={l}>
              <button
                type="button"
                className={`v3-su-step${done ? " done" : ""}${cur ? " cur" : ""}${can ? " can" : ""}`}
                aria-current={cur ? "step" : undefined}
                disabled={!can && !cur}
                onClick={can ? () => onGo!(i) : undefined}
              >
                <span className="dt">{done ? "✓" : `0${i + 1}`}</span>
                <span className="t">{l}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface AsideData {
  photo: string;
  live: string;
  open: string | null;
  openLabel: string;
  three: { n: string; l: string }[];
  getsLabel: string;
  gets: string[];
  setupLabel: string;
  stepText: string;
  summary: { k: string; v: string; tone: "on" | "no" | "mint" }[];
  lock: string;
}

export function SignupAside({ d }: { d: AsideData }) {
  return (
    <aside className="v3-su-aside">
      <div className="v3-su-photo">
        <Image src={d.photo} alt="" fill sizes="(max-width: 1023px) 100vw, 470px" className="v3-img" style={{ opacity: 0.85 }} priority />
        <div className="sh" />
        <div className="v3-su-live"><span className="v3-ping" aria-hidden><span className="ping" /><span /></span>{d.live}</div>
        {d.open && (
          <div className="v3-su-big">
            <div className="n">{d.open}</div>
            <div className="l">{d.openLabel}</div>
          </div>
        )}
      </div>
      <div className="v3-su-aside-in">
        {d.three.length > 0 && (
          <div className="v3-su-three">
            {d.three.map((x) => <div key={x.l}><div className="n">{x.n}</div><div className="l">{x.l}</div></div>)}
          </div>
        )}
        <div className="v3-su-gets-k">{d.getsLabel}</div>
        <div className="v3-su-gets">
          {d.gets.map((g) => <div key={g}><span className="v3-su-tick"><SmallTick /></span><span>{g}</span></div>)}
        </div>
        <div className="v3-su-sum">
          <div className="hd"><span className="k">{d.setupLabel}</span><span className="s">{d.stepText}</span></div>
          <dl>
            {d.summary.map((m) => (
              <div key={m.k}><dt>{m.k}</dt><dd className={m.tone === "on" ? undefined : m.tone}>{m.v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="v3-su-lock">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="2" aria-hidden><rect x="3.5" y="8" width="11" height="7.5" rx="2" /><path d="M6 8V5.5a3 3 0 016 0V8" /></svg>
          {d.lock}
        </div>
      </div>
    </aside>
  );
}

/** Grid + dark band behind the sign-up card, as in the template. */
export function SignupFrame({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="v3-su-main">
      <div className="v3-wrap v3-su-grid">
        {aside}
        <div className="v3-su-card">{children}</div>
      </div>
    </div>
  );
}

export function SignupTop({ eyebrow, have, children }: { eyebrow: string; have?: ReactNode; children?: ReactNode }) {
  return (
    <div className="v3-su-top">
      <div className="row">
        <div className="k">{eyebrow}</div>
        {have && <div className="have">{have}</div>}
      </div>
      {children}
    </div>
  );
}

export function SignupSticky({ a, b, meta, cta }: { a: string; b: string; meta: string; cta: { href: string; label: string } }) {
  return (
    <div className="v3-sticky">
      <div className="v3-sticky-in">
        <span className="v3-dot" style={{ width: 10, height: 10 }} />
        <div className="grow"><b>{a}</b> <span className="c">{b}</span></div>
        <span className="meta">{meta}</span>
        <a href={cta.href} className="v3-pill ghost">{cta.label}</a>
      </div>
    </div>
  );
}
