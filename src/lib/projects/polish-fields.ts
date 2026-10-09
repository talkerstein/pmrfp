/** The builder fields "Tidy my wording" may re-word (client-safe: no AI imports). */
export const POLISH_FIELDS = ["summary", "scope", "challenge", "approach", "outcome"] as const;
export type PolishField = (typeof POLISH_FIELDS)[number];
export type PolishInput = Record<PolishField, string>;
