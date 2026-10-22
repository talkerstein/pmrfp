import "./rfp-detail.css";
import type { CSSProperties, ReactNode } from "react";

export interface Fact {
  k: string;
  v: ReactNode;
  /** The closing date: highlighted. */
  hi?: boolean;
  /** A second line under the value (the countdown). */
  sub?: string | null;
}

/**
 * The key-facts row under a tender's header (depth plan, Step 2, block 1):
 * closing date with a countdown, value if anyone stated one, trade, work
 * type, funding / buyer, place and source. Only facts the listing holds are
 * passed in, so there is no "Not specified" cell; the grid fits however many
 * there are.
 */
export function KeyFacts({ facts, note }: { facts: Fact[]; note?: string | null }) {
  // One row up to six facts; more are split into two even rows (8 → 4 + 4), never one orphan.
  const cols = facts.length <= 6 ? Math.max(1, facts.length) : Math.ceil(facts.length / 2);
  return (
    <>
      <dl className="rd-facts" data-block="key-facts" style={{ "--rd-cols": cols } as CSSProperties}>
        {facts.map((f) => (
          <div key={f.k} className={f.hi ? "hi" : undefined}>
            <dt>{f.k}</dt>
            <dd>
              {f.v}
              {f.sub ? <span className="dl">{f.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {note ? <p className="rd-facts-note">{note}</p> : null}
    </>
  );
}
