import { z } from "zod";
import { MUNI_PROVINCES } from "./clauses";

/**
 * What the municipal writer collects (components/rfp-writer/municipal-wizard)
 * and /api/rfp-writer/municipal validates. Canada only.
 *
 * Templates, in the order the research ranked them (briefs/research/
 * 2026-10-21-small-town-procurement.md):
 *   1. facility-services  a 3-quote RFQ for janitorial, grass cutting, snow
 *                         clearing and sanding (multi-year, per site)
 *   2. small-works        a small-works RFQ or tender under $200k, with the
 *                         province's clause pack (roofing, HVAC, washrooms…)
 *   3. consultant         a building condition assessment or consultant RFP
 *   4. standing-offer     a call for a prequalified trades list / standing offer
 */
export const MUNI_TEMPLATES = ["facility-services", "small-works", "consultant", "standing-offer"] as const;
export type MuniTemplate = (typeof MUNI_TEMPLATES)[number];

export const FACILITY_SERVICES = ["janitorial", "grass-cutting", "snow"] as const;
export type FacilityService = (typeof FACILITY_SERVICES)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max);

export const municipalInputSchema = z
  .object({
    template: z.enum(MUNI_TEMPLATES),
    /** facility-services: which services (at least one). */
    services: z.array(z.enum(FACILITY_SERVICES)).max(3).optional(),
    /** small-works: a request for quotations or a tender. */
    docType: z.enum(["rfq", "rft"]).optional(),
    /** standing-offer: the trades on the list ("electrical, plumbing"). */
    trades: text(200).optional(),
    buyerName: text(200).min(2),
    /** The job's short name ("Arena roof replacement"); a blank to confirm when missing. */
    projectName: text(120).optional(),
    province: z.enum(MUNI_PROVINCES),
    description: z.string().trim().min(15, "Tell us a bit more about the job").max(1500),
    /** Buildings, parks, lots or roads covered. */
    sites: text(600).optional(),
    termYears: z.number().int().min(1).max(10).optional(),
    extensionYears: z.number().int().min(0).max(5).optional(),
    startDate: day.optional(),
    bidDeadline: day,
    questionDeadline: day.optional(),
    estimatedValue: z.number().int().nonnegative().max(100_000_000).optional(),
    siteVisit: z.boolean().optional(),
    siteVisitDate: day.optional(),
    /** CGL per occurrence, in dollars (a default the town confirms). */
    insurance: z.number().int().min(1_000_000).max(25_000_000).optional(),
    bidSecurity: z.boolean().default(false),
    /** Never on by default; refused for Ontario. */
    localPreference: z.boolean().default(false),
    bylawRef: text(160).optional(),
    /** New Brunswick: issue in both English and French. */
    bilingual: z.boolean().default(false),
    /** The page language (Quebec documents come out in French whatever it is). */
    lang: z.enum(["en", "fr", "es"]).optional(),
  })
  .refine((v) => v.template !== "facility-services" || (v.services?.length ?? 0) > 0, { message: "Pick at least one service", path: ["services"] })
  .refine((v) => !v.questionDeadline || v.questionDeadline <= v.bidDeadline, { message: "Questions must close on or before the closing date", path: ["questionDeadline"] });

export type MunicipalInput = z.infer<typeof municipalInputSchema>;
