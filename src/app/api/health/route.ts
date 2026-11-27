import { isHostingerCloudflareStaging } from "@/lib/d1/staging-config";

export const dynamic = "force-dynamic";

export function GET() {
  if (!isHostingerCloudflareStaging()) return new Response(null, { status: 404 });
  return Response.json({ service: "pmrfp", status: "application-running" }, {
    headers: { "cache-control": "no-store" },
  });
}
