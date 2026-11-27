import { randomUUID } from "node:crypto";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { readVpsMobileSession } from "@/lib/d1/vps-mobile-session";

const headers={"cache-control":"private, no-store"};
export async function POST(request:Request) {
  if (!isVpsLiveCustomerAuth()) return new Response(null,{status:404,headers});
  const session=await readVpsMobileSession(request).catch(()=>null);
  if (!session) return new Response(null,{status:401,headers});
  const p=await request.json().catch(()=>null);
  if (!p || !["ios","android"].includes(p.platform) ||
    typeof p.token!=="string" || !/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,160}\]$/.test(p.token)) {
    return new Response(null,{status:400,headers});
  }
  await vpsAppDatabase().prepare(`INSERT INTO device_push_tokens(id,user_id,token,platform)
    VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,
    last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(randomUUID(),session.userId,p.token,p.platform).run();
  return new Response(null,{status:204,headers});
}
