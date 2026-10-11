/**
 * How many database-backed pages each dynamic route prerenders at build time.
 *
 * Every other page renders on its first visit and is then cached (ISR,
 * dynamicParams stays true). Prebuilding hundreds of pages per deploy, across
 * ~14 deploys a day and preview builds that share the production database,
 * was a large part of the 2026-10-09 database outage. Keep these small.
 * A route's list must stay non-empty for every language: an empty list for
 * one language switches prebuilding off for the whole route.
 */
export const PREBUILD_EN = 12;
export const PREBUILD_OTHER = 1;

export function prebuildSlice<T>(all: readonly T[], lang: string): T[] {
  return all.slice(0, lang === "en" ? PREBUILD_EN : PREBUILD_OTHER);
}
