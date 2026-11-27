import "server-only";
import { activeD1Dataset } from "./dataset-server";
import { unstable_rethrow } from "next/navigation";
import { D1BoardClient } from "./board-client";
import { D1ApiError } from "./contracts";
import { vpsAppDatabase } from "./http-binding";
import { listPublicBoard, readNativeBoardRevision } from "../../../workers/d1-api/board";
import type { BoardRow } from "./board-contracts";

export function nativeBoardRevision() {
  return readNativeBoardRevision(vpsAppDatabase());
}

export async function nativeBoardShard(shard: number, revision: string) {
  const db = vpsAppDatabase();
  const url = new URL("https://pmrfp.com/v1/board");
  url.searchParams.set("shard", String(shard));
  const rows: BoardRow[] = [];
  for (let page = 0; page < 200; page++) {
    const { items, next, dataset } = await listPublicBoard(db, url, true);
    if (dataset !== revision) throw new D1ApiError(503, "dataset_changed");
    rows.push(...items);
    if (next === null) return rows;
    url.searchParams.set("after", next);
  }
  throw new D1ApiError(503, "dataset_unavailable");
}

export async function d1BoardShard(shard: number, dataset?: string) {
  return new D1BoardClient({ url: process.env.PMRFP_D1_API_URL || "", secret: process.env.PMRFP_D1_GATEWAY_SECRET || "", dataset: dataset ?? await activeD1Dataset(), onFetchError: unstable_rethrow, allowLocal: process.env.NODE_ENV !== "production" }).shard(shard);
}
