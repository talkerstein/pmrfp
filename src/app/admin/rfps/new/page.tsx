import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { RfpPostForm } from "@/components/forms/rfp-post-form";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";

export const metadata: Metadata = { title: "Seed RFP · Admin · PMRFP" };

export default async function AdminNewRfpPage() {
  await requireRole(["admin", "super_admin"]);

  const [categories, regions, propertyTypes] = await Promise.all([
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);

  return (
    <>
      <PageHeader
        title="Seed an RFP"
        description="Admin-created RFPs are tagged as admin-seeded and skip straight into the moderation flow."
      />
      {isDemoMode() && <DemoBanner />}

      <div className="max-w-3xl">
        <RfpPostForm
          categories={categories}
          regions={regions}
          propertyTypes={propertyTypes}
        />
      </div>
    </>
  );
}
