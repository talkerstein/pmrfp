import Image from "next/image";
import type { ReactNode } from "react";
import { foundingScarcity } from "@/lib/founding/config";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";
import { AudienceFaq, AudienceOpen, AudiencePrice } from "./audience-client";
import { loadV3Board, openCards } from "./data";
import { ByMarket } from "@/components/geo/by-market";
import { V3Body } from "@/components/v3/body";

/**
 * Audience landing template (Claude Design "Audience landing, tradesmen
 * example"). One layout for every "for …" page; each page passes its own copy.
 * Every number is live from the board and hidden when it can't be read.
 */
export type AudienceKey = "tradesmen" | "pm" | "condo" | "investors" | "realestate" | "suppliers" | "builders" | "gc";

const SWITCHER: [AudienceKey, string][] = [
  ["tradesmen", "/for-trades"],
  ["pm", "/for-property-managers"],
  ["condo", "/for/condo-boards"],
  ["investors", "/for/investors"],
  ["realestate", "/for/real-estate"],
  ["suppliers", "/for/suppliers"],
  ["builders", "/for/builders"],
  ["gc", "/for/general-contractors"],
];

export interface AudienceFeature {
  t: string;
  d: string;
  href?: string;
  chips?: string[];
  drops?: [string, string];
}

export interface AudienceContent {
  key: AudienceKey | null;
  /** Buyers post work and hire (free); sellers find work and get found (Trade Pro). */
  side: "seller" | "buyer";
  label: string;
  labelNote?: string;
  h1: string;
  h1b?: string;
  sub: ReactNode;
  cta: { label: string; href: string };
  cta2: { label: string; href: string };
  ctaNote?: ReactNode;
  img: string;
  /** Photo behind feature 01. */
  f1Img: string;
  getLabel: string;
  getHead: string;
  tags: string[];
  today?: { head: string; items: string[] };
  features: AudienceFeature[];
  steps: { t: string; d: string }[];
  /** Seller pricing copy; the price itself is formatted in the visitor's currency. */
  sellerSub?: string;
  faq: { q: string; a: string }[];
  disclaimer: string;
  endHead: string;
  endSub: string;
  endImg: string;
  /** Extra page content (kept from the old page), shown before the closing band. */
  extra?: ReactNode;
  /** Skip the Trade Pro / free-to-post price band (pages that show their own plans). */
  hidePrice?: boolean;
}

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1B1D3A" strokeWidth="2.5" aria-hidden><path d="M2.5 7.5l3 3 6-6.5" /></svg>
);
const Cross = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#4B4F6B" strokeWidth="2.2" aria-hidden><path d="M3 3l10 10M13 3L3 13" /></svg>
);

/** Card spans on the 12-column bento, by card count and whether "Today" takes 4 columns. */
function spans(n: number, today: boolean): number[] {
  if (today) return ([[8], [5, 3], [5, 3, 8], [5, 3, 4, 4], [5, 3, 3, 3, 2]] as number[][])[Math.min(n, 5) - 1] ?? [];
  return ([[12], [7, 5], [5, 4, 3], [5, 4, 3, 12], [5, 4, 3, 6, 6]] as number[][])[Math.min(n, 5) - 1] ?? [];
}

export async function AudienceLanding({ c, lang }: { c: AudienceContent; lang: Locale }) {
  const t = getT("v3Pages").audience;
  const h = getT("homeV3");
  const board = await loadV3Board();
  const L = (p: string) => localizePath(p, lang);
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const cards = openCards(board.rfps, lang, { today: h.closing.today, tomorrow: h.closing.tomorrow, daysLeft: h.closing.daysLeft });
  const scarcity = foundingScarcity(board.foundingLeft);
  const founding =
    c.side === "seller" && scarcity !== "soldout"
      ? { name: `${h.founding.barShort.split(/\s?:/)[0]}${lang === "fr" ? " :" : ":"}`, label: t.foundingLine, badge: scarcity === "low" ? h.founding.low : h.founding.limited }
      : null;
  const feats = c.features.slice(0, 5);
  const sp = spans(feats.length, Boolean(c.today));
  // Country-first: every board number is the visitor's country's (both ship; ByMarket picks).
  const bc = board.byCountry;
  const open = bc && bc.CA.open + bc.US.open > 0 ? bc : null;
  const perCountry = (f: (c: { open: number; closing7: number }) => number) =>
    bc ? <ByMarket ca={num(f(bc.CA))} us={num(f(bc.US))} /> : null;
  const bigNum: ReactNode = c.side === "seller" ? (bc ? perCountry((x) => x.open) : null) : board.trades != null ? num(board.trades) : null;
  const nums: [ReactNode, string][] = ([
    [bc ? perCountry((c) => c.closing7) : null, t.liveClosing],
    [board.trades, t.liveTrades],
    [board.regions, t.liveRegions],
  ] as [ReactNode, string][]).filter((x) => x[0] != null);

  return (
    <V3Body>
      {/* Hero */}
      <div className="dark">
        <section className="wrap a-hero">
          <div className="a-hero-main fadeup">
            <div className="a-kicker"><span className="dot" />{c.labelNote ? `${c.label} · ${c.labelNote}` : c.label}</div>
            <h1 className="a-h1">{c.h1}</h1>
            {c.h1b && <div className="a-h1b">{c.h1b}</div>}
            <p className="a-sub">{c.sub}</p>
            <div className="a-ctas">
              <a href={L(c.cta.href)} className="btn mint lg">{c.cta.label} →</a>
              <a href={L(c.cta2.href)} className="btn ghost lg">{c.cta2.label}</a>
            </div>
            {c.ctaNote && <div className="a-note">{c.ctaNote}</div>}
          </div>
          <div className="a-hero-side">
            <div className="a-photo">
              <Image src={c.img} alt="" fill priority sizes="(min-width: 1024px) 460px, 100vw" className="img-cover ph kb" />
              <div className="shade" />
              <span className="a-stamp spin" aria-hidden>
                <svg width="112" height="112" viewBox="0 0 96 96">
                  <defs><path id="a-circ" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs>
                  <text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#91F2CF"><textPath href="#a-circ">{c.side === "seller" ? t.stampSeller : t.stampBuyer}</textPath></text>
                </svg>
              </span>
              {open && (
                <div className="stat">
                  <div className="big">{perCountry((c) => c.open)}</div>
                  <div className="cap">
                    <span>{t.heroStat}</span>
                    <span className="pingw" aria-hidden><span className="ping" /><span /></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        <div className="wrap a-switch">
          <div className="a-switch-in">
            <span className="lab">{t.alsoFor}</span>
            <nav aria-label={t.others}>
              {SWITCHER.map(([k, href]) => (
                <a key={k} className="swi" href={L(href)} aria-current={k === c.key ? "page" : undefined}>{t.switcher[k]}</a>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* What changes */}
      <section className="wrap a-get">
        <div className="a-get-head">
          <div>
            <div className="eb">{c.getLabel}</div>
            <h2 className="h2">{c.getHead}</h2>
          </div>
          {c.tags.length > 0 && (
            <div className="a-tags">
              {c.tags.slice(0, 6).map((x) => <span key={x}><Check />{x}</span>)}
            </div>
          )}
        </div>
        <div className="a-bento">
          {c.today && (
            <div className="a-today">
              <div className="lb" style={{ color: "#4B4F6B" }}>{t.today}</div>
              <h3 className="hd">{c.today.head}</h3>
              <ul>
                {c.today.items.map((x) => <li key={x}><Cross /><span>{x}</span></li>)}
              </ul>
            </div>
          )}
          {feats.map((f, i) => {
            const style = { gridColumn: `span ${sp[i]}` };
            const no = `0${i + 1}`;
            if (i === 0)
              return (
                <div key={f.t} className="a-f photo zoom" style={style}>
                  <Image src={c.f1Img} alt="" fill sizes="(min-width: 1024px) 480px, 100vw" className="img-cover" />
                  <span className="shade" />
                  <span className="pill">{t.withUs}</span>
                  <span className="no">{no}</span>
                  <h3 className="t">{f.t}</h3>
                  <span className="d">{f.d}</span>
                </div>
              );
            if (i === 1)
              return (
                <div key={f.t} className="a-f mint" style={style}>
                  <span className="no">{bigNum != null ? `${no} · ${c.side === "seller" ? t.openNow : t.tradesCovered}` : no}</span>
                  <span>
                    {bigNum != null && <span className="big">{bigNum}</span>}
                    <h3 className="t" style={{ margin: 0 }}>{f.t}</h3>
                    <span className="d">{f.d}</span>
                  </span>
                </div>
              );
            if (i === 4 || (i === feats.length - 1 && f.href))
              return (
                <a key={f.t} className="a-f ink blk" style={style} href={f.href ? L(f.href) : L(c.cta.href)}>
                  <span className="no">{no}</span>
                  <h3 className="t">{f.t}</h3>
                  <span className="d">{f.d}</span>
                  <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="#91F2CF" strokeWidth="3" aria-hidden><path d="M9 27L27 9M12 9h15v15" /></svg>
                </a>
              );
            return (
              <div key={f.t} className="a-f white lift" style={style}>
                <span className="no">{no}</span>
                <h3 className="t">{f.t}</h3>
                <span className="d">{f.d}</span>
                {f.drops && (
                  <span className="drops">
                    <span className="drop"><i />{f.drops[0]}</span>
                    <span className="drop"><i />{f.drops[1]}</span>
                  </span>
                )}
                {f.chips && (
                  <span className="chips">{f.chips.map((x) => <span key={x}>{x}</span>)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      {c.steps.length === 3 && (
        <section className="wrap a-how">
          <div className="dots-bg a-how-box">
            <div className="a-how-head">
              <div>
                <div className="eb">{t.howEyebrow}</div>
                <h2 className="h2">{t.howTitle} <span className="tag-rot">{c.side === "seller" ? t.howTagSeller : t.howTagBuyer}</span></h2>
              </div>
              <a href={L(c.cta.href)} className="btn navy md">{c.cta.label} →</a>
            </div>
            <ol className="a-steps">
              {c.steps.map((s, i) => (
                <li key={s.t} className={`a-step s${i + 1}`}>
                  <span className="n" aria-hidden>{`0${i + 1}`}</span>
                  <span className="s">{fmt(t.step, { n: `0${i + 1}` })}</span>
                  <h3 className="t">{s.t}</h3>
                  <span className="d">{s.d}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Live on the board: hidden entirely when the board can't be read. */}
      {open && (
        <section className="dark">
          <div className="wrap a-live">
            <div className="a-live-k"><span className="pingw" aria-hidden><span className="ping" /><span /></span>{t.live}</div>
            <div className="a-nums">
              <div><div className="n1">{perCountry((c) => c.open)}</div><div className="l1">{t.liveOpen}</div></div>
              {nums.map(([n, l]) => <div key={l}><div className="n">{typeof n === "number" ? num(n) : n}</div><div className="l">{l}</div></div>)}
            </div>
            {c.side === "seller" && <AudienceOpen cards={cards} t={t} total={{ CA: num(open.CA.open), US: num(open.US.open) }} lang={lang} />}
          </div>
        </section>
      )}

      {!c.hidePrice && <AudiencePrice t={t} lang={lang} side={c.side} sellerSub={c.sellerSub ?? ""} cta={c.cta} founding={founding} />}

      {c.faq.length > 0 && (
        <section className="wrap a-faq">
          <div className="a-faq-side">
            <div className="eb">{t.questions}</div>
            <h2 className="h2">{t.commonQuestions}</h2>
            <div className="disc">{c.disclaimer}</div>
          </div>
          <AudienceFaq items={c.faq} />
        </section>
      )}

      {c.extra && <div className="wrap a-extra" style={c.faq.length ? undefined : { paddingTop: 96 }}>{c.extra}</div>}

      <section className="wrap a-end" style={c.faq.length || c.extra ? undefined : { paddingTop: 96 }}>
        <div className="a-end-box zoom">
          <Image src={c.endImg} alt="" fill sizes="(min-width: 1200px) 1136px, 100vw" className="img-cover" />
          <span className="shade" />
          <div style={{ position: "relative" }}>
            <div className="eb" style={{ color: "#91F2CF" }}>{c.label}</div>
            <h2 className="hd">{c.endHead}</h2>
            <div className="sb">{c.endSub}</div>
          </div>
          <div className="cta">
            <a href={L(c.cta.href)} className="btn mint xl">{c.cta.label} →</a>
            <a href={L(c.cta2.href)} className="btn line-white xl">{c.cta2.label}</a>
          </div>
        </div>
      </section>
    </V3Body>
  );
}
