"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BadgeEmbed({
  base,
  slug,
  profileUrl,
}: {
  base: string;
  slug: string;
  profileUrl: string;
}) {
  const img = `${base}/api/badge/${slug}`;
  const imgDark = `${img}?theme=dark`;

  const html = `<a href="${profileUrl}" target="_blank" rel="noopener">\n  <img src="${img}" alt="PMRFP Verified Vendor" width="214" height="54" />\n</a>`;
  const htmlDark = `<a href="${profileUrl}" target="_blank" rel="noopener">\n  <img src="${imgDark}" alt="PMRFP Verified Vendor" width="214" height="54" />\n</a>`;
  const markdown = `[![PMRFP Verified Vendor](${img})](${profileUrl})`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold">Preview</h3>
        <div className="mt-3 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="PMRFP badge (light)" width={214} height={54} />
          <div className="rounded-lg bg-navy p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgDark} alt="PMRFP badge (dark)" width={214} height={54} />
          </div>
        </div>
      </div>

      <Snippet label="HTML — light" code={html} />
      <Snippet label="HTML — dark" code={htmlDark} />
      <Snippet label="Markdown (README / docs)" code={markdown} />
    </div>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-foreground/90"><code>{code}</code></pre>
    </div>
  );
}
