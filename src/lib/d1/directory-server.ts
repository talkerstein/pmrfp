import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { D1ApiError, RFP_SLUG, UUID } from './contracts';
import { gatewayEndpoint } from './transport';
import { vpsAppDatabase } from './http-binding';
import { isVpsLiveCustomerAuth } from './staging-config';
import { listPublicDirectory } from '../../../workers/d1-api/directory';

/** Only the public projection is accepted; no arbitrary table/query transport. */
export async function readD1Directory(options: {slug?: string; type?: string} = {}) {
  const native = isVpsLiveCustomerAuth();
  const url = native ? new URL('https://pmrfp.com/v1/directory')
    : gatewayEndpoint({url:process.env.PMRFP_D1_API_URL || '',secret:process.env.PMRFP_D1_GATEWAY_SECRET || ''},'/v1/directory');
  if (options.slug) { if (!RFP_SLUG.test(options.slug)) return []; url.searchParams.set('slug',options.slug); }
  if (options.type) { if (!['trade_company','supplier'].includes(options.type)) return []; url.searchParams.set('type',options.type); }
  try {
    if (native) return (await listPublicDirectory(vpsAppDatabase(), url, true)).items;
    const followCheckpoint = process.env.PMRFP_D1_FOLLOW_CHECKPOINT === "enabled";
    const response = await fetch(url,{headers:{'x-pmrfp-gateway-key':process.env.PMRFP_D1_GATEWAY_SECRET || ''},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error('Directory unavailable');
    const result = await response.json();
    const matches = followCheckpoint
      ? typeof result.dataset === "string" && /^[a-f0-9]{64}$/.test(result.dataset)
      : result.dataset === process.env.PMRFP_D1_DATASET_SHA256;
    if (!matches || !Array.isArray(result.items) || result.items.length > 1000) throw Error('Checkpoint mismatch');
    for (const row of result.items) {
      if (!UUID.test(row.id) || !RFP_SLUG.test(row.slug) || typeof row.name !== 'string' ||
          !['trade_company','supplier'].includes(row.organization_type) ||
          !['show_contact','request_intro','hide_contact'].includes(row.public_contact_visibility) ||
          !['organization_categories','organization_regions','organization_property_types'].every(k=>Array.isArray(row[k]))) throw Error('Invalid public company');
      if (row.public_contact_visibility !== 'show_contact') row.website=row.email=row.phone=null;
    }
    return result.items as Record<string, unknown>[];
  } catch(error) { unstable_rethrow(error); throw new D1ApiError(503,'directory_unavailable'); }
}
