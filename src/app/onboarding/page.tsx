import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { requireUser } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const session = await requireUser();
  const role = session.profile.primary_role;
  const [categories, regions] = await Promise.all([getCategories(), getRegions()]);

  const heading =
    role === "trade"
      ? "Set up your company profile"
      : role === "property_manager"
        ? "Tell us about your organization"
        : "You're all set";

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-navy text-[13px] font-bold text-background">PM</span>
            <span className="text-lg font-semibold tracking-tight">{SITE.name}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "trade"
            ? "This helps property decision-makers find you. You can edit everything later."
            : "Just the basics — you can post an RFP right after."}
        </p>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8">
          <OnboardingForm role={role} categories={categories} regions={regions} />
        </div>
      </main>
    </div>
  );
}
