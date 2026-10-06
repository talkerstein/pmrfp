/**
 * Published Spotlights. Each one was submitted by the company, reviewed by us
 * and added here (with its photos under public/spotlight/<slug>/). Adding an
 * entry publishes the page, puts it in the sitemap and lists it on /spotlight.
 * Empty until the first reviewed article goes live.
 */
export interface Spotlight {
  slug: string;
  company: string;
  /** Company website. Linked rel="sponsored". */
  website?: string;
  /** Slug of the company's PMRFP directory profile, when it has one. */
  profileSlug?: string;
  title: string;
  summary: string;
  trade: string;
  city: string;
  province: string;
  /** ISO date published. */
  published: string;
  /** Paragraphs of the article, in order. */
  body: string[];
  /** Photos: path under /public and alt text. First one is the hero. */
  photos: { src: string; alt: string }[];
}

export const SPOTLIGHTS: Spotlight[] = [];

export const getSpotlight = (slug: string) => SPOTLIGHTS.find((s) => s.slug === slug);
