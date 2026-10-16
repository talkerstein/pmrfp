/**
 * Opens and clicks for the lifecycle funnel, from Resend's own delivery
 * webhooks (email.opened / email.clicked, which Resend only sends when open
 * / click tracking is switched on for the domain). No pixels or redirects of
 * our own. Pure.
 */
export interface Engagement {
  emailId: string;
  field: "opened_at" | "clicked_at";
}

export function engagementFromEvent(event: unknown): Engagement | null {
  const e = event as { type?: unknown; data?: { email_id?: unknown } } | null;
  const type = typeof e?.type === "string" ? e.type : "";
  const field = type === "email.opened" ? "opened_at" : type === "email.clicked" ? "clicked_at" : null;
  if (!field) return null;
  const id = typeof e?.data?.email_id === "string" ? e.data.email_id.trim() : "";
  if (!id || id.length > 100) return null;
  return { emailId: id, field };
}
