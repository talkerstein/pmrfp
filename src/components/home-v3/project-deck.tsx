"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export interface DeckProject { href: string; title: string; sub: string; img: string | null }

const TF = ["translate(0px,0px) rotate(-3deg)", "translate(34px,10px) rotate(5deg)", "translate(60px,24px) rotate(11deg)", "translate(-22px,16px) rotate(-10deg)"];

/**
 * Company profile "Projects" deck: the company's own published projects (up
 * to four), one card per project, with the step list switching the front
 * card. Autoplays until the visitor picks one; still under reduced motion.
 */
export function ProjectDeck({ projects, tag, seeLabel, noPhoto }: { projects: DeckProject[]; tag: string; seeLabel: string; noPhoto: string }) {
  const [deck, setDeck] = useState(0);
  const user = useRef(false);
  const total = projects.length;
  useEffect(() => {
    if (total < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!user.current) setDeck((d) => (d + 1) % total);
    }, 3200);
    return () => clearInterval(id);
  }, [total]);
  const front = projects[deck];
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="v3-cp-work">
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="tg">{tag}</div>
        <div className="ti"><a href={front.href}>{front.title}</a></div>
        <div className="v3-cp-steps">
          {projects.map((p, i) => (
            <button
              key={p.href}
              type="button"
              aria-pressed={i === deck}
              onClick={() => {
                user.current = true;
                setDeck(i);
              }}
            >
              <span className="no">{pad(i + 1)}</span>
              <span><b>{p.title}</b>{p.sub && <span className="s">{p.sub}</span>}</span>
            </button>
          ))}
        </div>
        <a className="see" href={front.href}>{seeLabel}</a>
      </div>
      <div className="v3-cp-deck" aria-hidden>
        <div className="sun" />
        {projects.map((p, i) => {
          const slot = (i - deck + total) % total;
          return (
            <div key={p.href} className="v3-cp-pcard" style={{ transform: TF[slot % TF.length], zIndex: total - slot }}>
              <div className="ph">
                {p.img ? <Image src={p.img} alt="" fill sizes="250px" style={{ objectFit: "cover" }} /> : <small>{noPhoto}</small>}
              </div>
              <div className="cap"><b>{p.title}</b><span>{pad(i + 1)}/{pad(total)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
