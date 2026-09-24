import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
          <Link href="/" aria-label="PMRFP home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        {/* Pages that bring a side panel (sign-up) mark themselves data-wide. */}
        <div className="w-full max-w-md has-[[data-wide]]:max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
