"use client";

import type { SelectHTMLAttributes } from "react";

/** A select that submits its GET form on change (the form still has a submit button without JS). */
export function SubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
