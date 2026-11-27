import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";

export async function GET() {
  if (!isVpsLiveCustomerAuth()) return new Response(null,{status:404});
  const [categories,propertyTypes,regions]=await Promise.all([getCategories(),getPropertyTypes(),getRegions()]);
  return Response.json({categories,propertyTypes,regions},{headers:{"cache-control":"public, max-age=300"}});
}
