import { requireRole } from "@/lib/access/access";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";
import { PageHeader } from "@/components/dashboard/stat-card";
import { RfpPostForm } from "@/components/forms/rfp-post-form";

export const metadata = { title: "Post an RFP" };

export default async function NewRfpPage() {
  await requireRole(["property_manager"]);
  const [categories, regions, propertyTypes] = await Promise.all([
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);

  return (
    <div>
      <PageHeader
        title="Post an RFP"
        description="Describe your project so qualified trades can express interest. We review every listing before it goes live."
      />
      <RfpPostForm categories={categories} regions={regions} propertyTypes={propertyTypes} />
    </div>
  );
}
