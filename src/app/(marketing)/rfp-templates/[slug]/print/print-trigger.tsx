"use client";

import { useEffect } from "react";

/** Auto-fires the browser print dialog once the print view has rendered. */
export function PrintTrigger() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.print();
    }, 400);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
