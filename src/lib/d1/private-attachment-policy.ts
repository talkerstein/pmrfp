export const attachmentTables = {
  contract: "service_contracts",
  certificate: "vendor_certificates",
  quote: "bid_comparison_bids",
} as const;

export type AttachmentKind = keyof typeof attachmentTables;

export const privateAttachmentHeaders = {
  "cache-control": "private, no-store",
  "content-security-policy": "default-src 'none'; sandbox",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
