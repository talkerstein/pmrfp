import Image from "next/image";
import { Fragment, type ReactNode } from "react";
import { SITE } from "@/lib/site";
import { getT } from "@/i18n/server";
import { localizePath, type Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { ContactFormV3 } from "./contact-form";
import { loadV3Board } from "./data";
import { V3Body } from "@/components/v3/body";

/**
 * Simple page template (Claude Design "Simple page, About example"): dark
 * hero with breadcrumbs and page tabs, a 720px article, an optional sticky
 * contact aside, and the mint "free to start" band.
 */
export type SimpleTab = "about" | "contact" | "advertise" | "terms" | "privacy" | "disclaimer";

const TABS: [SimpleTab, string][] = [
  ["about", "/about"],
  ["contact", "/contact"],
  ["advertise", "/advertise"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["disclaimer", "/disclaimer"],
];

/** Numbered section heading: the mint "01" chip, then the title. */
export function SH2({ no, id, sm, children }: { no?: number; id?: string; sm?: boolean; children: ReactNode }) {
  return (
    <h2 className={sm ? "s-h2 sm" : "s-h2"} id={id}>
      {no != null && <span className="no">{String(no).padStart(2, "0")}</span>}
      <span>{children}</span>
    </h2>
  );
}

export async function SimplePage({
  lang,
  current,
  group,
  title,
  lead,
  aside = true,
  crumbs,
  tabs = true,
  heroImage,
  children,
}: {
  lang: Locale;
  current: SimpleTab | null;
  group: "company" | "legal";
  title: string;
  lead?: ReactNode;
  aside?: boolean;
  /** Middle breadcrumbs, replacing the Company/Legal crumb (pages outside those groups). */
  crumbs?: { label: string; href?: string }[];
  /** Company/legal page tabs in the hero; off for pages outside those groups. */
  tabs?: boolean;
  /** Replaces the default skyline photo on the right of the hero (e.g. a project's cover). */
  heroImage?: { src: string; alt: string } | null;
  children: ReactNode;
}) {
  const t = getT("v3Pages").simple;
  const h = getT("homeV3");
  const board = await loadV3Board();
  const L = (p: string) => localizePath(p, lang);
  const tabName: Record<SimpleTab, string> = {
    about: h.footer.about2,
    contact: h.footer.contact,
    advertise: h.footer.advertise,
    terms: h.footer.terms,
    privacy: h.footer.privacy,
    disclaimer: t.disclaimer,
  };
  const open = board.open;
  return (
    <V3Body>
      <div className="dark">
        <section className="s-hero">
          <div className="s-hero-ph" aria-hidden>
            <Image src={heroImage?.src ?? "/images/photos/toronto-flatiron.webp"} alt={heroImage?.alt ?? ""} fill priority sizes="46vw" className="img-cover kb" />
            <div className="shade" />
          </div>
          <div className="wrap s-hero-in">
            <nav aria-label="Breadcrumb" className="s-crumbs">
              <a href={L("/")}>{t.home}</a>
              <span aria-hidden>/</span>
              {(crumbs ?? [{ label: group === "company" ? t.company : t.legal }]).map((c) => (
                <Fragment key={c.label}>
                  {c.href ? <a href={L(c.href)}>{c.label}</a> : <span>{c.label}</span>}
                  <span aria-hidden>/</span>
                </Fragment>
              ))}
              <span aria-current="page">{title}</span>
            </nav>
            <div className="s-hero-row">
              <div>
                <h1 className="s-h1">{title}</h1>
                {lead && <p className="s-lead">{lead}</p>}
              </div>
              {tabs && <nav aria-label={t.pages} className="s-tabs">
                {TABS.map(([k, href]) => (
                  <a key={k} href={L(href)} aria-current={k === current ? "page" : undefined}>{tabName[k]}</a>
                ))}
              </nav>}
            </div>
          </div>
        </section>
      </div>

      <section>
        <div className={`wrap s-body${aside ? "" : " solo"}`}>
          <article className="s-art">{children}</article>
          {aside && (
            <aside className="s-aside">
              <div className="s-contact">
                <span className="spin" aria-hidden>
                  <svg width="96" height="96" viewBox="0 0 96 96">
                    <defs><path id="s-circ" d="M48 48m-36 0a36 36 0 1 1 72 0a36 36 0 1 1 -72 0" /></defs>
                    <text fontFamily="IBM Plex Mono, monospace" fontSize="10.5" letterSpacing="2.2" fill="#1B1D3A"><textPath href="#s-circ">{t.stamp}</textPath></text>
                  </svg>
                </span>
                <div className="lb">{t.contact}</div>
                <div className="hd">{t.getInTouch}</div>
                <div className="rows">
                  <div className="row">
                    <span className="ic" aria-hidden><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#91F2CF" strokeWidth="2"><rect x="2" y="4" width="14" height="10" rx="2" /><path d="M2.5 5.5L9 10l6.5-4.5" /></svg></span>
                    <span><span className="k">{t.email}</span><a href={`mailto:${SITE.email}`}>{SITE.email}</a></span>
                  </div>
                  <div className="row">
                    <span className="ic" aria-hidden><svg width="16" height="18" viewBox="0 0 14 16" fill="none" stroke="#91F2CF" strokeWidth="2"><path d="M7 15s5-4.6 5-8.5A5 5 0 0 0 2 6.5C2 10.4 7 15 7 15z" /><circle cx="7" cy="6.5" r="1.6" /></svg></span>
                    <span><span className="k">{t.mail}</span><span className="ln">{t.careOf}</span><span className="ln">{h.footer.address}</span></span>
                  </div>
                </div>
              </div>
              {current !== "contact" && (
                <div className="s-form">
                  <ContactFormV3 title={t.noteTitle} sub={t.noteBody} again={t.writeAnother} compact />
                </div>
              )}
              {open != null && open > 0 && (
                <a className="s-open lift" href={L("/rfps")}>
                  <span><span className="n">{lang === "en" ? String(open) : formatNumber(open, lang)}</span><span className="l">{t.openCard}</span></span>
                  <span className="go">{t.browse}</span>
                </a>
              )}
            </aside>
          )}
        </div>
      </section>

      <section className="s-band">
        <div className="wrap s-band-in">
          <div>
            <div className="eb" style={{ color: "inherit" }}>{t.freeToStart}</div>
            <h2 className="hd">{t.bandHead1}<br />{t.bandHead2}</h2>
            <div className="sb">{t.bandSub}</div>
          </div>
          <div className="cta">
            <a href={L("/sign-up?role=trade")} className="btn ink xl">{h.cta.join}</a>
            <a href={L("/sign-up?role=property_manager")} className="btn line-ink xl">{h.cta.post}</a>
          </div>
        </div>
      </section>
    </V3Body>
  );
}
