"use client";

/**
 * Shared primitives for the v2 interactive marketing pages.
 * Ported 1:1 from the Claude Design handoff (dir-shared.jsx + pm-sections.jsx).
 */

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

/* ---------- inline icons ---------- */
export function DxCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function DxVChip() {
  return (
    <span className="dx-vchip">
      <DxCheck />
      Verified
    </span>
  );
}

/* ---------- monogram tile ---------- */
export function DxMono({
  mono,
  color,
  className,
  style,
}: {
  mono: string;
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={"dx-mg " + (className ?? "")} style={{ background: color, ...style }}>
      {mono}
    </span>
  );
}

/* ---------- reveal-on-scroll ---------- */
export function useInView<T extends HTMLElement>(once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return { ref, inView };
}

export function Rv({
  children,
  d = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  d?: 0 | 1 | 2 | 3;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={"rv " + (inView ? "in " : "") + (d ? "d" + d + " " : "") + className}
      style={style}
    >
      {children}
    </div>
  );
}

/* respects the user's reduced-motion preference (external store → no
   setState-in-effect, SSR-safe via the server snapshot) */
const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

/* ---------- final CTA band (was DxCta) ---------- */
export function FinalCta({
  title,
  sub,
  primary,
  primaryHref,
  secondary,
  secondaryHref,
}: {
  title: string;
  sub: string;
  primary: string;
  primaryHref: string;
  secondary: string;
  secondaryHref: string;
}) {
  return (
    <section className="dx-ctasec">
      <div className="dx-wrap">
        <div className="dx-cta">
          <div>
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <div className="dx-ctabtns">
            <Link className="btn btn-teal" href={primaryHref}>
              {primary} <span className="arrow">→</span>
            </Link>
            <Link className="btn btn-outline-light" href={secondaryHref}>
              {secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- disclaimer strip ---------- */
export function DisclaimerStrip({ children }: { children: ReactNode }) {
  return (
    <div className="pw-disc">
      <div className="dx-wrap">
        <p>{children}</p>
      </div>
    </div>
  );
}
