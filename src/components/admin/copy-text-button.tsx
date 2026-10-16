"use client";

import { useState } from "react";

/** Copies a ready-to-paste text (admin tools). Falls back to a prompt where the clipboard is blocked. */
export function CopyTextButton({ text, label = "Copy email", copiedLabel = "Copied" }: { text: string; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt(label, text);
        }
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
