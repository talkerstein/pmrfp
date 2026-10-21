import type { Messages } from "@/i18n/dictionaries";
import type { RecordLabels } from "./records";

/** The records export's labels in the page's language (townResults.export, plus the record's event names). */
export function recordLabels(m: Messages): RecordLabels {
  const t = m.townResults;
  const x = t.export;
  return {
    readme: { ...x.readme, retention: t.records.retention, sealedNote: t.summary.sealedNote, formats: t.records.body },
    sections: x.sections,
    post: x.post,
    addenda: x.addenda,
    questions: x.questions,
    responses: x.responses,
    invites: x.invites,
    log: x.log,
    results: x.results,
    none: "—",
    yes: x.yes,
    no: x.no,
    sealedClosed: x.sealedClosed,
    events: { ...m.townJobs.manage.log.events, ...t.log.events },
    kinds: { quote_request: m.townJobs.list.kind.quote_request, tender_mirror: m.townJobs.list.kind.tender_mirror },
  };
}
