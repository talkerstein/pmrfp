import "server-only";
import { unstable_rethrow } from "next/navigation";
import { D1PhotosClient } from "./photos-client";
export function d1PublicPhotos(ids: string[]) {
  return new D1PhotosClient({ url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "", dataset: process.env.PMRFP_D1_DATASET_SHA256 || "", onFetchError: unstable_rethrow, allowLocal: process.env.NODE_ENV !== "production" }).list(ids);
}
