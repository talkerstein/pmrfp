import { FileText } from "lucide-react";
import { Block } from "./blocks";
import { getT } from "@/i18n/server";

/**
 * "In plain language": two sentences on what the work is. The bid check's
 * summary of the notice when there is one (free for everyone, as it always
 * was); else a sentence built only from the title, buyer and dates, said
 * plainly to be that. A French SEAO notice's summary says it is a translation.
 */
export function PlainSummary({
  text,
  fromNotice,
  translated,
  translatedNote,
}: {
  text: string;
  fromNotice: boolean;
  translated?: boolean;
  translatedNote?: string;
}) {
  const t = getT("rfpDepth").summary;
  return (
    <Block id="summary" tone="teal" icon={<FileText className="size-4 text-teal-700" aria-hidden />} title={t.title}>
      <p className="mt-3 text-base leading-relaxed text-foreground">{text}</p>
      <p className="mt-2 text-xs text-muted-foreground">{fromNotice ? t.fromNotice : t.fromListing}{translated && translatedNote ? ` ${translatedNote}` : ""}</p>
    </Block>
  );
}
