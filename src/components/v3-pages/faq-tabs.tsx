"use client";

import { useId, useState, type ReactNode } from "react";

/** Pricing FAQ: two tabs (plans, Founding 500), one open answer at a time. */
export function FaqTabs({
  tabs,
  head,
  more,
}: {
  tabs: { label: string; items: { q: string; a: string }[] }[];
  head: ReactNode;
  more: ReactNode;
}) {
  const id = useId();
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const items = tabs[tab]?.items ?? [];
  return (
    <div className="v3-wrap vp-faq-in">
      <div className="l">
        {head}
        <div className="vp-faq-tabs" role="group">
          {tabs.map((x, i) => (
            <button
              key={x.label}
              type="button"
              className="tgl"
              aria-pressed={tab === i}
              onClick={() => {
                setTab(i);
                setOpen(0);
              }}
            >
              {x.label} · {x.items.length}
            </button>
          ))}
        </div>
        {more}
      </div>
      <div className="vp-faq-list">
        {items.map((f, i) => {
          const on = open === i;
          return (
            <div key={f.q} className="it">
              <h3>
                <button
                  type="button"
                  className="faqb"
                  aria-expanded={on}
                  aria-controls={`${id}-${i}`}
                  onClick={() => setOpen(on ? null : i)}
                >
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="q">{f.q}</span>
                  <span className={`chev${on ? " on" : ""}`} aria-hidden>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </span>
                </button>
              </h3>
              <div id={`${id}-${i}`} hidden={!on} className="a fadeup">
                {f.a}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
