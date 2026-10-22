import { Scale } from "lucide-react";
import { Block } from "./blocks";
import type { PurchasingRules as Rules } from "@/lib/rfp-detail/purchasing";
import { money } from "@/lib/rfp-detail/format";
import { getLang, getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { regionName } from "@/i18n/terms";
import { PROVINCE_NAME } from "@/lib/rfp-writer/municipal/clauses";

/**
 * "How this buyer buys" (depth plan, Step 2, block 7). Only what we hold:
 * the buyer's own researched policy; a range across the researched towns of
 * the province, said as "towns like this one typically…" with how many it
 * rests on; and the trade-agreement thresholds. Free for everyone.
 */
export function PurchasingRules({ rules, buyerName, province }: { rules: Rules; buyerName: string; province: string | null }) {
  const t = getT("rfpDepth").rules;
  const lang = getLang();
  const cad = (n: number) => money(n, "CAD", lang);
  const { policy, derived, agreement } = rules;
  if (!policy && !derived && !agreement) return null;
  const provinceName = (code: keyof typeof PROVINCE_NAME) => PROVINCE_NAME[code][lang] ?? PROVINCE_NAME[code].en;
  return (
    <Block id="rules" icon={<Scale className="size-4 text-teal-700" aria-hidden />} title={t.title} sub={t.asOf}>
      {policy && (
        <div className="mt-3" data-section="policy">
          <p className="text-sm font-medium">{fmt(t.policy, { name: buyerName, policy: policy.policy, year: policy.year })}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {policy.directUpTo !== null && <li>{fmt(t.direct, { n: cad(policy.directUpTo) })}</li>}
            {policy.quotesFrom !== null && <li>{fmt(t.quotes, { n: cad(policy.quotesFrom) })}</li>}
            <li>
              {policy.tenderFromConstruction !== undefined
                ? fmt(t.tenderBoth, { n: cad(policy.tenderFrom), c: cad(policy.tenderFromConstruction) })
                : fmt(t.tender, { n: cad(policy.tenderFrom) })}
            </li>
          </ul>
          <p className="mt-2 text-sm">
            <a href={policy.url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:underline">{t.readPolicy} ↗</a>
          </p>
        </div>
      )}
      {derived && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-section="derived">
          {fmt(derived.construction ? t.derivedConstruction : t.derived, {
            min: cad(derived.min),
            max: cad(derived.max),
            median: cad(derived.median),
            n: derived.towns,
            province: province ? regionName(province, lang) : provinceName(derived.code),
          })}
        </p>
      )}
      {agreement && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-section="agreement">
          {fmt(t.agreement, {
            period: agreement.period,
            name: agreement.agreement === "NWPTA" ? t.nwpta : t.cfta,
            gs: cad(agreement.goodsServices),
            cons: cad(agreement.construction),
          })}
          {agreement.system ? ` ${fmt(t.agreementSystem, { system: agreement.system })}` : ""}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t.note}</p>
    </Block>
  );
}
