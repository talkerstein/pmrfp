import { SPOTLIGHT } from "./config";

export interface SpotlightSubmission {
  company: string;
  contactName: string;
  email: string;
  website: string;
  title: string;
  trade: string;
  city: string;
  province: string;
  article: string;
  consent: boolean;
}

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First problem found, or null. Plain messages; they're shown to the buyer. */
export function validateSpotlight(s: SpotlightSubmission, photoCount: number): string | null {
  if (s.company.trim().length < 2) return "Please enter your company name.";
  if (s.contactName.trim().length < 2) return "Please enter your name.";
  if (!EMAIL_RE.test(s.email.trim())) return "Please enter a valid email address.";
  if (s.website.trim() && !URL_RE.test(s.website.trim())) return "Website should start with https://";
  if (s.title.trim().length < 10) return "Give the project a descriptive title (10+ characters).";
  if (s.trade.trim().length < 2) return "Tell us the trade or service (for example roofing, electrical).";
  if (s.city.trim().length < 2) return "Please enter the project's city.";
  const words = wordCount(s.article);
  if (words < SPOTLIGHT.minWords) return `Your article needs at least ${SPOTLIGHT.minWords} words (it has ${words}).`;
  if (words > SPOTLIGHT.maxWords + 100) return `Please keep the article to about ${SPOTLIGHT.maxWords} words (it has ${words}).`;
  if (photoCount < SPOTLIGHT.minPhotos) return "Please add at least one photo of the project.";
  if (photoCount > SPOTLIGHT.maxPhotos) return `Please add no more than ${SPOTLIGHT.maxPhotos} photos.`;
  if (!s.consent) return "Please confirm you own this project and have your client's permission to feature it.";
  return null;
}
