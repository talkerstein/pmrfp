export const FEDERAL_SOURCE: string;
export const FEDERAL_MIN_VALUE: number;
export const FEDERAL_CSV_URL: string;
export const FEDERAL_DATASET_URL: string;
export const SOLICITATION: Record<string, string>;

export interface FederalSeedRow {
  source_key: string;
  reference: string | null;
  owner_org: string;
  buyer: string | null;
  vendor: string | null;
  vendor_is_individual: boolean;
  title: string;
  object: string | null;
  value: number;
  award_date: string;
  start_date: string | null;
  end_date: string | null;
  number_of_bids: number | null;
  solicitation_procedure: string | null;
  procurement_method: string | null;
  non_competitive: boolean;
  trades: string[];
  period: string;
}

export function objectOf(r: Record<string, string>): { code: number | null; text: string };
export function classifyFederal(r: Record<string, string>, opts?: { minValue?: number }): { skip: string } | { trades: string[]; text: string; skip?: undefined };
export function isoDay(v: unknown): string | null;
export function federalSeedRow(r: Record<string, string>, opts?: { minValue?: number; today?: string }): FederalSeedRow | { skip: string };
export function keepLatest(map: Map<string, FederalSeedRow>, row: FederalSeedRow): boolean;
