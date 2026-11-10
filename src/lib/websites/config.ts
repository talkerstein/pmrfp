/**
 * Prices shown on /websites: the ONE place to change them. The same number
 * is shown in each country's own currency (never converted), like the
 * sponsorship prices.
 */
export const WEBSITES = {
  /** Property-manager site, one time, "from". */
  pmFrom: 800,
  /** Trade Proof Site, per month, Trade Pro included (pilot). */
  tradeMonthly: 99,
} as const;

export type WebsiteKind = "pm" | "trade";

/** How an enquiry from each door is filed in contact_requests. */
export const ENQUIRY_TYPE: Record<WebsiteKind, "property_manager_help" | "vendor_question"> = {
  pm: "property_manager_help",
  trade: "vendor_question",
};

/** First line of the stored message, so admins can spot website enquiries. */
export function enquiryMessage(kind: WebsiteKind, website: string, message: string): string {
  const site = website.trim();
  const head = [`[Website enquiry: ${kind === "pm" ? "property manager" : "trade"}]`];
  if (site) head.push(`Current site: ${site}`);
  return `${head.join("\n")}\n\n${message.trim()}`.slice(0, 3000);
}
