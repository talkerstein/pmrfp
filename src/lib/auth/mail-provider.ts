/**
 * "Open Gmail" / "Open Outlook" on the check-your-email screen. Pure and
 * client-safe. Matches the address's domain to the web inbox that holds it;
 * a work address on someone's own domain (most of our members) is unknown,
 * and gets no button rather than a wrong one.
 *
 * The links open the inbox, never a compose or search with the address in the
 * URL: the address stays out of every URL we build.
 */

export type MailProviderId = "gmail" | "outlook" | "yahoo" | "icloud" | "proton" | "aol";

export interface MailProvider {
  id: MailProviderId;
  name: string;
  href: string;
}

const PROVIDERS: Record<MailProviderId, MailProvider> = {
  gmail: { id: "gmail", name: "Gmail", href: "https://mail.google.com/mail/u/0/#inbox" },
  outlook: { id: "outlook", name: "Outlook", href: "https://outlook.live.com/mail/0/inbox" },
  yahoo: { id: "yahoo", name: "Yahoo Mail", href: "https://mail.yahoo.com/" },
  icloud: { id: "icloud", name: "iCloud Mail", href: "https://www.icloud.com/mail" },
  proton: { id: "proton", name: "Proton Mail", href: "https://mail.proton.me/u/0/inbox" },
  aol: { id: "aol", name: "AOL Mail", href: "https://mail.aol.com/" },
};

const DOMAINS: Record<string, MailProviderId> = {
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "outlook.com": "outlook",
  "outlook.ca": "outlook",
  "hotmail.com": "outlook",
  "hotmail.ca": "outlook",
  "hotmail.fr": "outlook",
  "live.com": "outlook",
  "live.ca": "outlook",
  "live.fr": "outlook",
  "msn.com": "outlook",
  "yahoo.com": "yahoo",
  "yahoo.ca": "yahoo",
  "yahoo.fr": "yahoo",
  "ymail.com": "yahoo",
  "rocketmail.com": "yahoo",
  "icloud.com": "icloud",
  "me.com": "icloud",
  "mac.com": "icloud",
  "proton.me": "proton",
  "protonmail.com": "proton",
  "pm.me": "proton",
  "aol.com": "aol",
};

/** The web inbox for this address, or null when we can't tell. */
export function mailProviderFor(email: string | null | undefined): MailProvider | null {
  const at = String(email ?? "").trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return null;
  const domain = String(email).trim().toLowerCase().slice(at + 1);
  const id = DOMAINS[domain];
  return id ? PROVIDERS[id] : null;
}
