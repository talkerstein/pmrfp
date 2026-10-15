"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";
import { badgeLinkUrl } from "@/lib/badge/snippet";

export function BadgeEmbed({
  base,
  slug,
  profileUrl,
}: {
  base: string;
  slug: string;
  profileUrl: string;
}) {
  const t = useT("partnersClient").badge;
  const img = `${base}/api/badge/${slug}`;
  const imgDark = `${img}?theme=dark`;

  // Branded anchor, pointing at the member's own profile — a plain, natural
  // link (no keyword-stuffed anchor text, which is what search engines treat
  // as widget link spam).
  const alt = t.anchor;
  // utm_source=badge: sign-ups that come through the badge are credited to it (/admin/signups).
  const href = badgeLinkUrl(profileUrl, slug);
  const hrefAttr = href.replace(/&/g, "&amp;");
  const html = `<a href="${hrefAttr}" target="_blank" rel="noopener">\n  <img src="${img}" alt="${alt}" width="214" height="54" />\n</a>`;
  const htmlDark = `<a href="${hrefAttr}" target="_blank" rel="noopener">\n  <img src="${imgDark}" alt="${alt}" width="214" height="54" />\n</a>`;
  const textLink = `<a href="${hrefAttr}" target="_blank" rel="noopener">${t.anchor}</a>`;
  const signature = fmt(t.signature, { url: profileUrl });
  const markdown = `[![${alt}](${img})](${href})`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold">{t.preview}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-card p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={t.previewLight} width={214} height={54} />
          <div className="rounded-lg bg-indigo p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgDark} alt={t.previewDark} width={214} height={54} />
          </div>
        </div>
      </div>

      <Snippet label={t.light} code={html} />
      <Snippet label={t.dark} code={htmlDark} />
      <Snippet label={t.textLink} code={textLink} />
      <Snippet label={t.email} code={signature} />
      <Snippet label={t.markdown} code={markdown} />
    </div>
  );
}

export function Snippet({ label, code }: { label: string; code: string }) {
  const t = useT("partnersClient").snippet;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t.toastCopied);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t.toastFailed);
    }
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t.copied : t.copy}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-foreground/90"><code>{code}</code></pre>
    </div>
  );
}
