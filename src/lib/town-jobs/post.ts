/**
 * The extra fields a town's post form sends (components/towns/jobs/town-job-form)
 * on top of the PM job form's (lib/validations rfpPostSchema): the kind of
 * post, the official link and portal (a mirror of a formal tender), and an
 * optional question deadline. Pure, so the action and the tests share it.
 */
import { checkQuestionDeadline, cleanOfficialUrl, parsePostKind, type PostKind } from "./rules";

export interface TownPostFields {
  postKind: PostKind;
  officialUrl: string | null;
  officialPortal: string | null;
  questionDeadline: string | null;
}

export type TownPostError = "kind" | "url" | "question_deadline";

export function parseTownPostFields(fd: FormData, closing: string | null, today?: string): { ok: true; fields: TownPostFields } | { ok: false; error: TownPostError } {
  const postKind = parsePostKind(fd.get("postKind"));
  if (!postKind) return { ok: false, error: "kind" };
  const rawUrl = String(fd.get("officialUrl") ?? "").trim();
  const officialUrl = rawUrl ? cleanOfficialUrl(rawUrl) : null;
  // A mirror is nothing without its official posting.
  if ((rawUrl && !officialUrl) || (postKind === "tender_mirror" && !officialUrl)) return { ok: false, error: "url" };
  const portal = String(fd.get("officialPortal") ?? "").trim().replace(/\s+/g, " ").slice(0, 120) || null;
  // Questions about a formal tender go through its official portal: no question deadline here.
  const qd = postKind === "quote_request" ? checkQuestionDeadline(String(fd.get("questionDeadline") ?? "").trim(), closing, today) : ({ ok: true, value: null } as const);
  if (!qd.ok) return { ok: false, error: "question_deadline" };
  return { ok: true, fields: { postKind, officialUrl: postKind === "tender_mirror" ? officialUrl : null, officialPortal: postKind === "tender_mirror" ? portal : null, questionDeadline: qd.value } };
}

/** The rfp_posts columns a town's post adds. */
export function townPostColumns(f: TownPostFields, page: { buyerKey: string; buyerName: string }) {
  return {
    buyer_key: page.buyerKey,
    buyer_name: page.buyerName,
    post_kind: f.postKind,
    official_url: f.officialUrl,
    official_portal: f.officialPortal,
    question_deadline: f.questionDeadline,
  };
}
