/**
 * GoHighLevel (GHL) REST API client — minimal typed wrapper for the
 * operations PMRFP actually needs: upsert contact, update fields, add to
 * pipeline.
 *
 * Configuration:
 *   GHL_API_KEY         — Location-level API key from GHL Settings → API Keys
 *   GHL_LOCATION_ID     — Location ID from GHL Settings → Business Profile
 *
 * Fails silently (returns null / undefined) when env vars are unset, so the
 * app runs without GHL configured. Once Rishon pastes the keys into Vercel,
 * the integration switches on with no code change.
 *
 * Uses the GHL v1 REST API (services.leadconnectorhq.com). v2 (OAuth) is the
 * roadmap path; v1 with location-level API keys is the right call for the
 * single-tenant PMRFP setup.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function isConfigured(): boolean {
  return !!(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: GHL_VERSION,
    Accept: "application/json",
  };
}

interface GhlContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** PMRFP custom field keys; matched to GHL custom-field ids via the field map. */
  customFields?: Record<string, string | number | null | undefined>;
  /** GHL contact tags. */
  tags?: string[];
}

interface GhlContactResponse {
  contact: {
    id: string;
    email: string;
    locationId: string;
  };
  new?: boolean;
}

/**
 * Upsert a contact by email. Sets the standard fields + any provided custom
 * fields. Tags accumulate (GHL doesn't replace; we add new tags).
 *
 * Returns the contact id, or null if GHL isn't configured / call fails.
 */
export async function upsertGhlContact(
  input: GhlContactInput,
): Promise<string | null> {
  if (!isConfigured()) return null;
  try {
    const body = {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      locationId: process.env.GHL_LOCATION_ID,
      tags: input.tags,
      customFields: input.customFields
        ? Object.entries(input.customFields)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([key, value]) => ({ key, field_value: String(value) }))
        : undefined,
    };
    const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[ghl] upsertContact failed ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const json = (await res.json()) as GhlContactResponse;
    return json.contact?.id ?? null;
  } catch (e) {
    console.error("[ghl] upsertContact threw", e);
    return null;
  }
}

/**
 * Add an opportunity (deal) to a pipeline at a given stage. Idempotent by
 * (contactId, pipelineId) — won't create duplicates.
 */
export async function ensureGhlOpportunity(params: {
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  name: string;
  monetaryValue?: number;
}): Promise<string | null> {
  if (!isConfigured()) return null;
  try {
    // Check existing opportunities for this contact in this pipeline.
    const existing = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&contact_id=${params.contactId}&pipeline_id=${params.pipelineId}&limit=1`,
      { headers: headers() },
    );
    if (existing.ok) {
      const data = (await existing.json()) as { opportunities?: { id: string; pipelineStageId: string }[] };
      const found = data.opportunities?.[0];
      if (found) {
        // If already at the right stage, no-op. Otherwise move stage.
        if (found.pipelineStageId === params.pipelineStageId) return found.id;
        await moveGhlOpportunityStage(found.id, params.pipelineStageId);
        return found.id;
      }
    }

    // Create new opportunity.
    const res = await fetch(`${GHL_BASE}/opportunities/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        pipelineId: params.pipelineId,
        pipelineStageId: params.pipelineStageId,
        contactId: params.contactId,
        name: params.name,
        monetaryValue: params.monetaryValue,
        status: "open",
      }),
    });
    if (!res.ok) {
      console.error(`[ghl] createOpportunity failed ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (e) {
    console.error("[ghl] ensureOpportunity threw", e);
    return null;
  }
}

async function moveGhlOpportunityStage(opportunityId: string, pipelineStageId: string): Promise<void> {
  try {
    await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ pipelineStageId }),
    });
  } catch (e) {
    console.error("[ghl] moveOpportunityStage threw", e);
  }
}

/** Add tags to an existing contact (does not remove). */
export async function addGhlTags(contactId: string, tags: string[]): Promise<void> {
  if (!isConfigured() || tags.length === 0) return;
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ tags }),
    });
  } catch (e) {
    console.error("[ghl] addTags threw", e);
  }
}
