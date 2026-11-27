import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { D1ApiError } from "./contracts";
import { gatewayEndpoint } from "./transport";

const datasetPattern = /^[a-f0-9]{64}$/;

export async function readD1Dataset(): Promise<string> {
  if (process.env.PMRFP_D1_FOLLOW_CHECKPOINT !== "enabled") {
    return process.env.PMRFP_D1_DATASET_SHA256 || "";
  }

  const secret = process.env.PMRFP_D1_GATEWAY_SECRET || "";
  const url = gatewayEndpoint({ url: process.env.PMRFP_D1_API_URL || "", secret }, "/v1/checkpoint");
  try {
    const response = await fetch(url, {
      headers: { "x-pmrfp-gateway-key": secret },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Checkpoint unavailable");
    const { dataset } = await response.json();
    if (typeof dataset !== "string" || !datasetPattern.test(dataset)) throw new Error("Invalid checkpoint");
    return dataset;
  } catch (error) {
    unstable_rethrow(error);
    throw new D1ApiError(503, "dataset_unavailable");
  }
}

/** Share one checkpoint per render so paginated and parallel reads agree. */
export const activeD1Dataset = cache(readD1Dataset);
