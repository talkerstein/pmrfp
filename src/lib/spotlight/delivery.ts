import "server-only";
import type Stripe from "stripe";
import { escHtml } from "@/lib/email/parts";
import { sendAdminNewSale, sendSpotlightPaid } from "@/lib/email/send";

export async function sendSpotlightCheckoutEmails(session: Stripe.Checkout.Session) {
  const company = session.custom_fields?.find(field => field.key === "company")?.text?.value ?? session.customer_details?.name;
  const email = session.customer_details?.email;
  const cents = session.amount_total;
  const currency = (session.currency || "cad").toUpperCase();
  await sendAdminNewSale({
    company: company ? escHtml(company) : null,
    email: escHtml(email ?? "(no email on file)"),
    plan: "Project Spotlight",
    interval: "one-time",
    amountFormatted: typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${currency}` : "—",
  });
  if (email) await sendSpotlightPaid(email, session.id);
}
