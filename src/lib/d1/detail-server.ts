import "server-only";
import { activeD1Dataset } from "./dataset-server";
import { unstable_rethrow } from "next/navigation";
import { D1DetailClient } from "./detail-client";
import { d1AccessToken } from "./server";
export async function d1RfpDetail(slug: string) {
  return new D1DetailClient({ url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "", dataset: await activeD1Dataset(), onFetchError: unstable_rethrow, allowLocal: process.env.NODE_ENV !== "production" }).get(await d1AccessToken(), slug);
}
