/**
 * A company gives its insurance policy number and nothing else. The number is
 * private (organization_insurance_policies); the public profile only gets the
 * word below in organizations.insurance_status, which the badge, directory
 * cards and bid comparison already read.
 */

import type { Locale } from "@/i18n/config";

export const INSURED = "Insured";
export const POLICY_NUMBER_MAX = 80;

const INSURED_TEXT: Record<Locale, string> = { en: INSURED, fr: "Assuré", es: "Asegurado" };

/** What the public line should say once the form is saved. */
export function nextInsuranceStatus(input: {
  policyNumber: string;
  hadPolicy: boolean;
  removeLine: boolean;
  current: string | null;
}): string | null {
  if (input.policyNumber) return INSURED;
  if (input.hadPolicy || input.removeLine) return null;
  // Companies that typed a line before this field existed keep it until they change it.
  return input.current;
}

/** The public line in the page's language. A company's own older wording stays as typed. */
export function insuranceText(status: string | null | undefined, lang: Locale): string | null {
  if (!status) return null;
  return status === INSURED ? INSURED_TEXT[lang] : status;
}
