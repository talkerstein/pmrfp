import type { Locale } from "@/i18n/config";

export const INSURED = "Insured";
export const POLICY_NUMBER_MAX = 80;

const labels: Record<Locale, string> = { en: INSURED, fr: "Assuré", es: "Asegurado" };

export function insuranceText(status: string | null | undefined, lang: Locale) {
  return status === INSURED ? labels[lang] : status;
}
