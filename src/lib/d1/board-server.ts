import "server-only";
import { D1BoardClient } from "./board-client";
export function d1BoardShard(shard: number) {
  return new D1BoardClient({ url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "", dataset: process.env.PMRFP_D1_DATASET_SHA256 || "", allowLocal: process.env.NODE_ENV !== "production" }).shard(shard);
}
