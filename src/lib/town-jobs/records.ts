/**
 * PMRFP for Towns, Part C: the records export (pure; unit-tested in
 * test/unit/towns-part-c.test.ts). One post, or every post in a date range,
 * as a ZIP of CSV files (for spreadsheets and archives) and one readable
 * HTML page per post (print or keep): the post, its addenda, the questions
 * and answers, the responses (a sealed box's only once it's opened), the
 * invitations, the full record (the append-only log, opening included) and
 * the recommendation and award. A README carries the retention note.
 *
 * Loaded by ./records-server.ts; served by /api/town-jobs/export.
 */
import { escHtml } from "@/lib/email/parts";
import type { ZipFile } from "@/lib/zip/write";
import { toCsv } from "./results";
import type { SummaryResponse } from "./results";

export interface RecordPost {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  submission_instructions: string | null;
  status: string;
  post_kind: string | null;
  sealed: boolean;
  deadline: string | null;
  question_deadline: string | null;
  closes_at: string | null;
  published_at: string | null;
  created_at: string | null;
  buyer_name: string | null;
  official_url: string | null;
  official_portal: string | null;
  budget_min: number | null;
  budget_max: number | null;
  city: string | null;
  province: string | null;
}

export interface RecordBundle {
  post: RecordPost;
  addenda: { number: number; body: string; official_url: string | null; old_deadline: string | null; new_deadline: string | null; created_at: string }[];
  questions: { asked_at: string; question: string; public_question: string | null; answer: string | null; answered_at: string | null; status: string; asker_company: string | null }[];
  /** Null while a sealed box is still closed: only its count goes in. */
  responses: SummaryResponse[] | null;
  sealedCount: number | null;
  invites: { created_at: string; kind: string; to: string; status: string }[];
  log: { at: string; event: string; actor: string | null; company: string | null; detail: Record<string, unknown> }[];
  results: {
    recommended: string | null;
    rationale: string | null;
    recommended_by: string | null;
    recommended_at: string | null;
    winner: string | null;
    amount: number | null;
    amount_public: boolean;
    award_date: string | null;
    published_at: string | null;
  } | null;
}

export interface RecordLabels {
  readme: { title: string; town: string; exported: string; by: string; range: string; posts: string; retention: string; files: string; sealedNote: string; formats: string };
  sections: { post: string; addenda: string; questions: string; responses: string; invites: string; record: string; results: string };
  post: Record<"title" | "reference" | "kind" | "status" | "sealed" | "closes" | "questionsBy" | "published" | "buyer" | "summary" | "scope" | "requirements" | "instructions" | "budget" | "place" | "official", string>;
  addenda: Record<"number" | "issued" | "body" | "moved" | "document", string>;
  questions: Record<"asked" | "question" | "published" | "answer" | "answered" | "by", string>;
  responses: Record<"company" | "amount" | "kind" | "start" | "notes" | "message" | "status" | "received" | "insurance" | "wsib" | "profile", string>;
  invites: Record<"sent" | "kind" | "to" | "status", string>;
  log: Record<"at" | "event" | "by" | "company" | "detail", string>;
  results: Record<"recommended" | "rationale" | "by" | "at" | "winner" | "amount" | "amountHidden" | "date" | "published", string>;
  none: string;
  yes: string;
  no: string;
  sealedClosed: string;
  events: Record<string, string>;
  kinds: Record<string, string>;
}

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");
const ts = (s: string | null | undefined) => (s ? new Date(s).toISOString().replace(".000Z", "Z") : "");
const money = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2));

/** A folder name for a post: its date and slug ("2026-10-21-arena-roof-ab12"). */
export function recordFolder(p: Pick<RecordPost, "slug" | "published_at" | "created_at">): string {
  return `${day(p.published_at ?? p.created_at) || "undated"}-${p.slug}`.replace(/[^a-z0-9-]+/gi, "-").slice(0, 120);
}

function postCsv(b: RecordBundle, L: RecordLabels): string {
  const p = b.post;
  const rows: [string, unknown][] = [
    [L.post.title, p.title],
    [L.post.reference, p.slug],
    [L.post.buyer, p.buyer_name],
    [L.post.kind, L.kinds[p.post_kind ?? ""] ?? p.post_kind],
    [L.post.status, p.status],
    [L.post.sealed, p.sealed ? L.yes : L.no],
    [L.post.closes, ts(p.closes_at) || day(p.deadline)],
    [L.post.questionsBy, day(p.question_deadline)],
    [L.post.published, ts(p.published_at)],
    [L.post.place, [p.city, p.province].filter(Boolean).join(", ")],
    [L.post.budget, p.budget_min != null || p.budget_max != null ? `${money(p.budget_min)} - ${money(p.budget_max)}` : ""],
    [L.post.official, p.official_url ? `${p.official_portal ?? ""} ${p.official_url}`.trim() : ""],
    [L.post.summary, p.summary],
    [L.post.scope, p.scope],
    [L.post.requirements, p.requirements],
    [L.post.instructions, p.submission_instructions],
  ];
  return toCsv(["field", "value"], rows);
}

function responsesCsv(b: RecordBundle, L: RecordLabels): string {
  const R = L.responses;
  if (!b.responses) return toCsv([R.company, R.amount], [[L.sealedClosed.replace("{n}", String(b.sealedCount ?? 0)), ""]]);
  return toCsv(
    [R.received, R.company, R.amount, R.kind, R.start, R.notes, R.message, R.status, R.profile, R.insurance, R.wsib],
    b.responses.map((r) => [ts(r.createdAt), r.company, money(r.amount), r.kind ?? "", r.startDate ?? "", r.notes ?? "", r.message ?? "", r.status, r.profileStatus ?? "", r.insurance ?? "", r.wsib ?? ""]),
  );
}

/** Every file for these posts: README, index.csv, and per post a folder of CSVs plus record.html. */
export function recordFiles(bundles: readonly RecordBundle[], L: RecordLabels, meta: { town: string; exportedAt: string; exportedBy: string; range: string }): ZipFile[] {
  const files: ZipFile[] = [];
  const readme = [
    L.readme.title,
    "",
    `${L.readme.town}: ${meta.town}`,
    `${L.readme.exported}: ${meta.exportedAt}`,
    `${L.readme.by}: ${meta.exportedBy}`,
    `${L.readme.range}: ${meta.range}`,
    `${L.readme.posts}: ${bundles.length}`,
    "",
    L.readme.retention,
    "",
    L.readme.sealedNote,
    "",
    L.readme.formats,
    "",
    L.readme.files,
  ].join("\r\n");
  files.push({ name: "README.txt", data: `﻿${readme}\r\n` });
  files.push({
    name: "index.csv",
    data: toCsv(
      [L.post.reference, L.post.title, L.post.kind, L.post.status, L.post.sealed, L.post.published, L.post.closes, L.sections.responses, "folder"],
      bundles.map((b) => [b.post.slug, b.post.title, L.kinds[b.post.post_kind ?? ""] ?? b.post.post_kind, b.post.status, b.post.sealed ? L.yes : L.no, ts(b.post.published_at), ts(b.post.closes_at), b.responses ? b.responses.length : (b.sealedCount ?? 0), recordFolder(b.post)]),
    ),
  });
  for (const b of bundles) {
    const dir = recordFolder(b.post);
    files.push({ name: `${dir}/post.csv`, data: postCsv(b, L) });
    files.push({
      name: `${dir}/addenda.csv`,
      data: toCsv([L.addenda.number, L.addenda.issued, L.addenda.body, L.addenda.moved, L.addenda.document], b.addenda.map((a) => [a.number, ts(a.created_at), a.body, a.old_deadline && a.new_deadline ? `${a.old_deadline} -> ${a.new_deadline}` : "", a.official_url ?? ""])),
    });
    files.push({
      name: `${dir}/questions.csv`,
      data: toCsv([L.questions.asked, L.questions.by, L.questions.question, L.questions.published, L.questions.answer, L.questions.answered], b.questions.map((q) => [ts(q.asked_at), q.asker_company ?? "", q.question, q.public_question ?? "", q.answer ?? "", ts(q.answered_at)])),
    });
    files.push({ name: `${dir}/responses.csv`, data: responsesCsv(b, L) });
    files.push({ name: `${dir}/invites.csv`, data: toCsv([L.invites.sent, L.invites.kind, L.invites.to, L.invites.status], b.invites.map((i) => [ts(i.created_at), i.kind, i.to, i.status])) });
    files.push({
      name: `${dir}/record.csv`,
      data: toCsv([L.log.at, L.log.event, L.log.by, L.log.company, L.log.detail], b.log.map((l) => [ts(l.at), L.events[l.event] ?? l.event, l.actor ?? "", l.company ?? "", JSON.stringify(l.detail)])),
    });
    const r = b.results;
    files.push({
      name: `${dir}/award.csv`,
      data: toCsv(
        [L.results.recommended, L.results.rationale, L.results.by, L.results.at, L.results.winner, L.results.amount, L.results.amountHidden, L.results.date, L.results.published],
        r ? [[r.recommended ?? "", r.rationale ?? "", r.recommended_by ?? "", ts(r.recommended_at), r.winner ?? "", money(r.amount), r.amount != null && !r.amount_public ? L.yes : "", day(r.award_date), ts(r.published_at)]] : [],
      ),
    });
    files.push({ name: `${dir}/record.html`, data: recordHtml(b, L, meta.town) });
  }
  return files;
}

const e = (v: unknown) => escHtml(v == null ? "" : String(v));
const pre = (v: string | null | undefined) => (v ? `<div class="pre">${e(v)}</div>` : "");

function table(head: string[], rows: unknown[][], none: string): string {
  if (!rows.length) return `<p class="muted">${e(none)}</p>`;
  return `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/** One post's record as a readable, printable page (no scripts, no external files). */
export function recordHtml(b: RecordBundle, L: RecordLabels, town: string): string {
  const p = b.post;
  const facts: [string, string][] = [
    [L.post.reference, p.slug],
    [L.post.buyer, p.buyer_name ?? town],
    [L.post.kind, L.kinds[p.post_kind ?? ""] ?? p.post_kind ?? ""],
    [L.post.status, p.status],
    [L.post.sealed, p.sealed ? L.yes : L.no],
    [L.post.closes, ts(p.closes_at) || day(p.deadline)],
    [L.post.published, ts(p.published_at)],
  ];
  const R = L.responses;
  const responses = b.responses
    ? table([R.received, R.company, R.amount, R.kind, R.start, R.notes, R.status, R.insurance, R.wsib], b.responses.map((r) => [ts(r.createdAt), r.company, money(r.amount), r.kind ?? "", r.startDate ?? "", r.notes ?? "", r.status, r.insurance ?? "", r.wsib ?? ""]), L.none)
    : `<p>${e(L.sealedClosed.replace("{n}", String(b.sealedCount ?? 0)))}</p>`;
  const r = b.results;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(p.title)}</title>
<style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:960px;margin:24px auto;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f4f6}.pre{white-space:pre-wrap}.muted{color:#666}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px}dt{font-weight:600}</style>
</head><body>
<p class="muted">${e(town)}</p>
<h1>${e(p.title)}</h1>
<h2>${e(L.sections.post)}</h2>
<dl>${facts.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl>
${pre(p.summary)}${p.scope ? `<h3>${e(L.post.scope)}</h3>${pre(p.scope)}` : ""}${p.requirements ? `<h3>${e(L.post.requirements)}</h3>${pre(p.requirements)}` : ""}${p.submission_instructions ? `<h3>${e(L.post.instructions)}</h3>${pre(p.submission_instructions)}` : ""}
<h2>${e(L.sections.addenda)}</h2>
${table([L.addenda.number, L.addenda.issued, L.addenda.body, L.addenda.moved], b.addenda.map((a) => [a.number, ts(a.created_at), a.body, a.old_deadline && a.new_deadline ? `${a.old_deadline} → ${a.new_deadline}` : ""]), L.none)}
<h2>${e(L.sections.questions)}</h2>
${table([L.questions.asked, L.questions.by, L.questions.question, L.questions.answer, L.questions.answered], b.questions.map((q) => [ts(q.asked_at), q.asker_company ?? "", q.public_question ?? q.question, q.answer ?? "", ts(q.answered_at)]), L.none)}
<h2>${e(L.sections.responses)}</h2>
${responses}
<h2>${e(L.sections.invites)}</h2>
${table([L.invites.sent, L.invites.kind, L.invites.to], b.invites.map((i) => [ts(i.created_at), i.kind, i.to]), L.none)}
<h2>${e(L.sections.results)}</h2>
${r ? `<dl><dt>${e(L.results.recommended)}</dt><dd>${e(r.recommended ?? "")}</dd><dt>${e(L.results.rationale)}</dt><dd class="pre">${e(r.rationale ?? "")}</dd><dt>${e(L.results.winner)}</dt><dd>${e(r.winner ?? "")}</dd><dt>${e(L.results.amount)}</dt><dd>${e(money(r.amount))}${r.amount != null && !r.amount_public ? ` (${e(L.results.amountHidden)})` : ""}</dd><dt>${e(L.results.date)}</dt><dd>${e(day(r.award_date))}</dd></dl>` : `<p class="muted">${e(L.none)}</p>`}
<h2>${e(L.sections.record)}</h2>
${table([L.log.at, L.log.event, L.log.by, L.log.company], b.log.map((l) => [ts(l.at), L.events[l.event] ?? l.event, l.actor ?? "", l.company ?? ""]), L.none)}
</body></html>
`;
}
