import { PRICING } from "@/lib/site";

/**
 * The honest annual-vs-monthly comparison for Trade Pro, from the real price
 * constants and nowhere else ($249 a year vs $29 x 12 = $348: save $99).
 * Returns null unless paying yearly really is cheaper, so a price change can
 * never leave a "save" line that is not true. No end dates, no urgency.
 */
export interface AnnualSaving {
  annual: number;
  monthly: number;
  /** What twelve monthly payments add up to. */
  yearly: number;
  save: number;
}

export function annualSaving(prices: { proAnnual: number; proMonthly: number } = PRICING): AnnualSaving | null {
  const yearly = prices.proMonthly * 12;
  const save = yearly - prices.proAnnual;
  if (!Number.isFinite(save) || prices.proAnnual <= 0 || prices.proMonthly <= 0 || save <= 0) return null;
  return { annual: prices.proAnnual, monthly: prices.proMonthly, yearly, save };
}
