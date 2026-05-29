import Link from "next/link";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Saved Vendors" };

export default async function SavedVendorsPage() {
  await requireRole(["property_manager"]);

  return (
    <div>
      <PageHeader
        title="Saved Vendors"
        description="Trades you've bookmarked from the directory."
      />
      <EmptyState
        title="No saved vendors yet"
        description="Browse the directory and save trades you'd like to keep on hand for future projects."
      >
        <Link href="/directory" className={buttonVariants()}>
          Browse the directory
        </Link>
      </EmptyState>
    </div>
  );
}
