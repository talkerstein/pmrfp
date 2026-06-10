#!/usr/bin/env node
/**
 * PMRFP inbox monitor — reads info@pmrfp.com over IMAP and surfaces what matters
 * for the money loop, so the daily monitor agent can act without a human:
 *   - prospect REPLIES to outreach (hot leads — ping Rishon, advance pipeline)
 *   - BOUNCES / delivery failures (bad address + deliverability signal)
 *   - KILL requests (a reply from Rishon containing "kill" — cancel a queued draft)
 *
 * Reuses the SAME mailbox creds as the SMTP sender (one mailbox, one password):
 *   IMAP_USER  default = SMTP_USER || info@pmrfp.com
 *   IMAP_PASS  default = SMTP_PASS            [REQUIRED]
 *   IMAP_HOST  default imap.hostinger.com
 *   IMAP_PORT  default 993
 *   OWNER_EMAIL default hi@talkerstein.ca     (whose "kill" replies count)
 *
 * Usage:
 *   node --env-file=.env.local scripts/check-replies.mjs --days 3 --json --write
 *     --days N   look back N days (default 3)
 *     --json     print structured JSON (for the agent to parse)
 *     --write    also save to briefs/replies/{YYYY-MM-DD}.json
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

function loadEnvLocal() {
  if (process.env.SMTP_PASS || process.env.IMAP_PASS) return;
  const p = ".env.local";
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    if (process.env[k] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnvLocal();

const HOST = process.env.IMAP_HOST || "imap.hostinger.com";
const PORT = Number(process.env.IMAP_PORT || 993);
const USER = process.env.IMAP_USER || process.env.SMTP_USER || "info@pmrfp.com";
const PASS = process.env.IMAP_PASS || process.env.SMTP_PASS;
const OWNER = (process.env.OWNER_EMAIL || "hi@talkerstein.ca").toLowerCase();

const argv = process.argv.slice(2);
const days = Number((() => { const i = argv.indexOf("--days"); return i >= 0 ? argv[i + 1] : 3; })());
const asJson = argv.includes("--json");
const doWrite = argv.includes("--write");

if (!PASS) {
  console.error("ERROR: IMAP_PASS (or SMTP_PASS) not set. Add SMTP_USER=info@pmrfp.com + SMTP_PASS=<mailbox pw> to .env.local. Nothing read.");
  process.exit(2);
}

const AUTOMATED = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?@|@facebookmail|@linkedin|@bounce|@accounts\.google|@instagram|@stripe\.com|@resend|@hostinger|@github)/i;
const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery)/i;
const BOUNCE_SUBJ = /(delivery (status notification|has failed)|undeliverable|returned mail|not delivered|delivery failure|mail delivery failed|address not found|failure notice)/i;

function classify(fromAddr, subject, inReplyTo) {
  const f = (fromAddr || "").toLowerCase();
  const s = subject || "";
  const isBounce = BOUNCE_FROM.test(f) || BOUNCE_SUBJ.test(s);
  const isAutomated = AUTOMATED.test(f);
  const isReply = /^\s*re:/i.test(s) || !!inReplyTo;
  const isFromOwner = f === OWNER;
  return { isBounce, isAutomated, isReply, isFromOwner };
}

async function main() {
  const client = new ImapFlow({ host: HOST, port: PORT, secure: PORT === 993, auth: { user: USER, pass: PASS }, logger: false });
  await client.connect();
  const since = new Date(Date.now() - days * 86400000);
  const metas = [];
  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch({ since }, { uid: true, envelope: true, flags: true })) {
      metas.push({ uid: msg.uid, env: msg.envelope || {}, seen: msg.flags?.has?.("\\Seen") ?? null });
    }
    const results = [];
    for (const m of metas) {
      const fromAddr = m.env.from?.[0]?.address || "";
      const fromName = m.env.from?.[0]?.name || "";
      const subject = m.env.subject || "";
      const date = m.env.date ? new Date(m.env.date).toISOString() : null;
      const cl = classify(fromAddr, subject, m.env.inReplyTo);
      const interesting = cl.isBounce || cl.isFromOwner || !cl.isAutomated;
      let snippet = "";
      let killRequest = false;
      if (interesting) {
        try {
          const one = await client.fetchOne(m.uid, { source: true }, { uid: true });
          const parsed = await simpleParser(one.source);
          const text = (parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, " ") : "") || "")
            .replace(/^>.*$/gm, "")
            .replace(/\s+/g, " ")
            .trim();
          snippet = text.slice(0, 400);
          if (cl.isFromOwner && /\bkill\b/i.test(`${subject} ${text}`)) killRequest = true;
        } catch { /* snippet best-effort */ }
      }
      results.push({ uid: m.uid, from: fromAddr, name: fromName, subject, date, snippet, ...cl, killRequest, seen: m.seen });
    }

    const replies = results.filter((r) => r.isReply && !r.isAutomated && !r.isBounce && !r.isFromOwner);
    const bounces = results.filter((r) => r.isBounce);
    const kills = results.filter((r) => r.killRequest);
    const otherHuman = results.filter((r) => !r.isAutomated && !r.isBounce && !r.isReply && !r.isFromOwner);

    const out = {
      checkedAt: new Date().toISOString(),
      windowDays: days,
      mailbox: USER,
      counts: { replies: replies.length, bounces: bounces.length, kills: kills.length, otherHuman: otherHuman.length },
      replies, bounces, kills, otherHuman,
    };

    if (doWrite) {
      const dir = "briefs/replies";
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const fp = `${dir}/${new Date().toISOString().slice(0, 10)}.json`;
      writeFileSync(fp, JSON.stringify(out, null, 2));
      console.error(`Wrote ${fp}`);
    }
    if (asJson) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`Inbox check (last ${days}d) on ${USER}: ${replies.length} replies, ${bounces.length} bounces, ${kills.length} kill requests, ${otherHuman.length} other human.`);
      for (const r of replies) console.log(`REPLY  ${r.from}  "${r.subject}"${r.snippet ? `  — ${r.snippet.slice(0, 140)}` : ""}`);
      for (const b of bounces) console.log(`BOUNCE ${b.from}  "${b.subject}"`);
      for (const k of kills) console.log(`KILL   ${k.from}  "${k.subject}"  — ${k.snippet.slice(0, 140)}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch((e) => { console.error("check-replies failed:", e?.message || e); process.exit(1); });
