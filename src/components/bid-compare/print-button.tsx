"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Print or save as PDF" on the board view (hidden on the printout itself). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="size-3.5" /> {label}
    </Button>
  );
}
