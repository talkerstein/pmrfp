/** See business-name.mjs for the rule and its known false negatives / positives. */
export function businessOnly(raw: unknown): string | null;
export function businessKey(name: unknown): string;
export function tidyCase(s: string): string;
