import type { CertStatus } from "@/lib/vendor-certs/rules";

/** The status chip's colours, shared by the tracker and the landing page's try-it box. */
export const CERT_CHIP: Record<CertStatus, string> = {
  valid: "bg-teal-50 text-teal-800 border-teal-200",
  expiring: "bg-amber-50 text-amber-800 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  missing: "bg-slate-100 text-slate-700 border-slate-200",
};
