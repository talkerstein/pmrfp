import "server-only";
import { activeD1Dataset, readD1Dataset } from "./dataset-server";
import { unstable_rethrow } from "next/navigation";
import { D1PhotosClient } from "./photos-client";
export async function d1PublicPhotos(ids: string[]) {
  const list = (dataset: string) => new D1PhotosClient({
    url: process.env.PMRFP_D1_API_URL || "",
    secret: process.env.PMRFP_D1_GATEWAY_SECRET || "",
    dataset,
    onFetchError: unstable_rethrow,
    allowLocal: process.env.NODE_ENV !== "production",
  }).list(ids);
  const dataset = await activeD1Dataset();
  try {
    return await list(dataset);
  } catch (error) {
    unstable_rethrow(error);
    if (process.env.PMRFP_D1_FOLLOW_CHECKPOINT !== "enabled") throw error;
    const latest = await readD1Dataset();
    if (latest === dataset) throw error;
    return list(latest);
  }
}
