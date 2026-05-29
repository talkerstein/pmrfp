import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Account suspended" };

export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your account is suspended</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Access to this account is currently paused. If you believe this is a mistake, please contact
        us at{" "}
        <a href={`mailto:${SITE.supportEmail}`} className="text-gold-700 hover:underline">
          {SITE.supportEmail}
        </a>
        .
      </p>
      <Link href="/" className="mt-6 text-sm text-gold-700 hover:underline">
        ← Back to {SITE.name}
      </Link>
    </div>
  );
}
