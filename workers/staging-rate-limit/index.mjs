import { DurableObject } from "cloudflare:workers";
import { gatewayMatches } from "../../scripts/d1-auth/private-gateway.mjs";

const minute = 60_000;
const limits = {
  "auth-ip": [10, minute], "auth-account": [5, minute], "api-read": [120, minute], "api-write": [30, minute],
  referral: [3, 10 * minute], "rfp-email": [3, 10 * minute], "form-recipient": [3, 1440 * minute],
};
const noStore = { "cache-control": "no-store" };

export class StagingRateLimit extends DurableObject {
  async consume(bucket) {
    const [limit, windowMs] = limits[bucket];
    const now = Date.now();
    const storage = this.ctx.storage;
    const recent = (storage.kv.get("attempts") ?? []).filter(time => time > now - windowMs);
    if (recent.length >= limit) return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    recent.push(now);
    storage.kv.put("attempts", recent);
    storage.kv.put("expires", now + windowMs);
    await storage.setAlarm(now + windowMs);
    return 0;
  }

  async alarm() {
    const storage = this.ctx.storage;
    const attempts = storage.kv.get("attempts") ?? [];
    const expires = storage.kv.get("expires") ?? (attempts.at(-1) ?? 0) + minute;
    if (expires > Date.now()) await storage.setAlarm(expires);
    else await storage.deleteAll();
  }
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/consume" || url.search || request.method !== "POST") {
      return new Response(null, { status: 404, headers: noStore });
    }
    if (env.VPS_EGRESS_IP && request.headers.get("cf-connecting-ip") !== env.VPS_EGRESS_IP) {
      return new Response(null, { status: 403, headers: noStore });
    }
    if (!await gatewayMatches(request.headers.get("x-pmrfp-rate-limit-key"), env.GATEWAY_SECRET)) {
      return new Response(null, { status: 401, headers: noStore });
    }
    try {
      const { bucket, key } = await request.json();
      if (!Object.hasOwn(limits, bucket) || typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) {
        return new Response(null, { status: 400, headers: noStore });
      }
      const retry = await env.LIMITS.getByName(bucket + ":" + key).consume(bucket);
      return retry ? new Response(null, { status: 429, headers: { ...noStore, "retry-after": String(retry) } })
        : new Response(null, { status: 204, headers: noStore });
    } catch {
      return new Response(null, { status: 503, headers: noStore });
    }
  },
};

export default worker;
