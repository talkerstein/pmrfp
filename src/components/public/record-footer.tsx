import { localizeCredits } from "@/lib/data-credits";
import type { PageKind } from "@/lib/corrections/rules";
import { ReportErrorLink } from "@/components/public/report-error-link";

/**
 * Footer for pages built from public records: each source's licence credit
 * in the page's language (required by OGL / CC BY / city terms) and the
 * "Report an error or request removal" link. Pass `credits={[]}` where the
 * page already prints its credits and only the link is needed.
 */
export function RecordFooter({
  credits,
  lang,
  kind,
  path,
  refId,
  className,
}: {
  credits: Iterable<string | null | undefined>;
  lang: string;
  kind: PageKind;
  path: string;
  refId?: string;
  className?: string;
}) {
  const lines = localizeCredits(credits, lang);
  return (
    <div className={className ?? "record-footer mt-6"} data-record-footer>
      {lines.map((c) => (
        <p key={c} className="small muted" data-credit>
          {c}
        </p>
      ))}
      <p className="small muted">
        <ReportErrorLink kind={kind} path={path} refId={refId} />
      </p>
    </div>
  );
}
