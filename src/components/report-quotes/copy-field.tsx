"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A read-only value with a Copy button (forwarding address, share link). Falls back to a prompt where the clipboard is blocked. */
export function CopyField({ value, label, copy, copied }: { value: string; label: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt(label, value);
    }
  }
  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary/40 px-3 font-mono text-sm"
      />
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={onCopy}>
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {done ? copied : copy}
      </Button>
    </div>
  );
}
