#!/usr/bin/env node
/**
 * PMRFP cold-outreach SMTP sender.
 *
 * Sends personalized cold first-touch emails through the REAL info@pmrfp.com
 * mailbox over Hostinger SMTP. This is the same mailbox/path used to hand-send
 * the first PM batches (proven inbox placement) — deliberately NOT Resend,
 * which prohibits cold/unsolicited email and would put the transactional
 * account (welcome / sale / interest notifications) at risk.
 *
 * USAGE
 *   Queue mode (what the scheduled agent uses):
 *     node --env-file=.env.local scripts/send-outreach.mjs briefs/outbound-queue/2026-06-09.json
 *   Single mode (one-off):
 *     node --env-file=.env.local scripts/send-outreach.mjs --to a@b.com --subject "Hi" --body-file draft.txt
 *   Add --dry-run to preview (no send, no file writes).
 *
 * ENV (put in .env.local — gitignored, NEVER commit, never paste in chat):
 *   SMTP_HOST   default smtp.hostinger.com
 *   SMTP_PORT   default 465 (implicit TLS). Use 587 for STARTTLS.
 *   SMTP_USER   the mailbox, e.g. info@pmrfp.com
 *   SMTP_PASS   the mailbox password (REQUIRED)
 *   OUTREACH_FROM_NAME        default "Rishon @ PMRFP"
 *   OUTREACH_DAILY_CAP        default 15  (warm-up guard; refuses to exceed per run)
 *   OUTREACH_MAILING_ADDRESS  default "5050 Dufferin St, North York, ON M3H 5T5"
 *
 * QUEUE JSON FORMAT (array of drafts the outreach agent writes):
 *   [
 *     {
 *       "to": "gshalamay@citytowersinc.com",
 *       "subject": "Bid CityTowers' projects for free",
 *       "body": "Hi George,\n\n...\n\n...",          // 3 short paras, NO signature (added below)
 *       "status": "queued",                            // queued | killed | sent | failed
 *       "sendAfter": "2026-06-09T13:00:00.000Z"        // optional; held until this time (24h kill window)
 *     }
 *   ]
 * Sends items where status === "queued" AND (no sendAfter OR sendAfter <= now),
 * up to the daily cap. Writes the file back: status -> "sent" + sentAt, or
 * "failed" + error. To KILL a draft before send, set its "status" to "killed"
 * in the JSON (or delete the object).
 */
import nodemailer from "nodemailer";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// --- robust .env.local loader (works even without node --env-file) ---
function loadEnvLocal() {
  if (process.env.SMTP_PASS) return;
  const p = ".env.local";
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER || "info@pmrfp.com";
const PASS = process.env.SMTP_PASS;
const FROM_NAME = process.env.OUTREACH_FROM_NAME || "Rishon @ PMRFP";
const CAP = Number(process.env.OUTREACH_DAILY_CAP || 15);
const MAILING_ADDRESS =
  process.env.OUTREACH_MAILING_ADDRESS || "5050 Dufferin St, North York, ON M3H 5T5";

const SIGNATURE = [
  "",
  "Rishon",
  "Founder, PMRFP",
  "pmrfp.com",
  MAILING_ADDRESS,
  'Not a fit? Reply "no thanks" and you won\'t hear from me again.',
].join("\n");

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const flags = Object.fromEntries(
  argv
    .map((a, i) => [a, argv[i + 1]])
    .filter(([a]) => a.startsWith("--")),
);

function bodyWithSig(body) {
  return `${String(body).trimEnd()}\n${SIGNATURE}\n`;
}

function makeTransport() {
  if (!PASS) {
    console.error(
      "ERROR: SMTP_PASS is not set. Add SMTP_USER + SMTP_PASS (the info@pmrfp.com mailbox creds) to .env.local, then re-run. Nothing was sent.",
    );
    process.exit(2);
  }
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  });
}

async function sendOne(transport, { to, subject, body }) {
  const text = bodyWithSig(body);
  if (dryRun) {
    console.log(`\n[dry-run] FROM ${FROM_NAME} <${USER}>\n         TO   ${to}\n         SUBJ ${subject}\n--------\n${text}`);
    return { ok: true, dryRun: true };
  }
  const info = await transport.sendMail({
    from: `${FROM_NAME} <${USER}>`,
    to,
    subject,
    text,
  });
  return { ok: true, messageId: info.messageId };
}

async function runQueue(path) {
  const queue = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(queue)) {
    console.error(`ERROR: ${path} is not a JSON array of drafts.`);
    process.exit(1);
  }
  const nowIso = new Date().toISOString(); // wall clock at run time
  const sendable = queue.filter(
    (d) =>
      d.status === "queued" &&
      (!d.sendAfter || d.sendAfter <= nowIso),
  );
  if (sendable.length === 0) {
    console.log("Nothing to send (no queued drafts past their send time).");
    return;
  }
  if (sendable.length > CAP) {
    console.log(`Capping at ${CAP}/run (warm-up). ${sendable.length - CAP} will wait for the next run.`);
  }
  const batch = sendable.slice(0, CAP);
  const transport = dryRun ? null : makeTransport();
  let sent = 0,
    failed = 0;
  for (const draft of batch) {
    try {
      const r = await sendOne(transport, draft);
      if (!dryRun) {
        draft.status = "sent";
        draft.sentAt = new Date().toISOString();
        draft.messageId = r.messageId;
      }
      sent++;
      console.log(`SENT  -> ${draft.to}  "${draft.subject}"`);
    } catch (err) {
      if (!dryRun) {
        draft.status = "failed";
        draft.error = String(err?.message || err);
      }
      failed++;
      console.error(`FAIL  -> ${draft.to}: ${err?.message || err}`);
    }
  }
  if (!dryRun) writeFileSync(path, JSON.stringify(queue, null, 2));
  console.log(`\nDone. sent=${sent} failed=${failed} held=${Math.max(0, sendable.length - batch.length)} (cap ${CAP}).`);
}

async function runSingle() {
  const to = flags["--to"];
  const subject = flags["--subject"];
  const bodyFile = flags["--body-file"];
  if (!to || !subject || !bodyFile) {
    console.error("Single mode needs --to, --subject, and --body-file. Or pass a queue .json path.");
    process.exit(1);
  }
  const body = readFileSync(bodyFile, "utf8");
  const transport = dryRun ? null : makeTransport();
  try {
    const r = await sendOne(transport, { to, subject, body });
    console.log(`SENT -> ${to} "${subject}"${r.messageId ? ` (${r.messageId})` : ""}`);
  } catch (err) {
    console.error(`FAIL -> ${to}: ${err?.message || err}`);
    process.exit(1);
  }
}

const positional = argv.find((a) => !a.startsWith("--") && (a.endsWith(".json") || existsSync(a)));
if (positional && existsSync(positional) && statSync(positional).isDirectory()) {
  const files = readdirSync(positional)
    .filter((f) => f.endsWith(".json") && f !== "EXAMPLE.json")
    .sort();
  if (files.length === 0) {
    console.log(`No queue files in ${positional}.`);
  }
  for (const f of files) {
    console.log(`\n=== ${f} ===`);
    await runQueue(join(positional, f));
  }
} else if (positional) {
  await runQueue(positional);
} else if (flags["--to"]) {
  await runSingle();
} else {
  console.error(
    "Usage:\n  node --env-file=.env.local scripts/send-outreach.mjs <queue.json> [--dry-run]\n  node --env-file=.env.local scripts/send-outreach.mjs --to x@y.com --subject \"...\" --body-file draft.txt [--dry-run]",
  );
  process.exit(1);
}
