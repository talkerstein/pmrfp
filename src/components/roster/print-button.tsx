"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The browser's own print (one page per building; no PDF library). */
export function PrintButton({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" /> {label}
    </Button>
  );
}
