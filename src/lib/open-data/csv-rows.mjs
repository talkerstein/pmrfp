/**
 * Streaming CSV reader for the local import scripts: reads a byte stream in
 * chunks and yields one record object (keyed by the header row) at a time,
 * so a 640 MB file never sits in memory. RFC 4180: quoted fields may hold
 * commas, doubled quotes and newlines. A UTF-8 BOM is dropped.
 *
 * `delimiter` defaults to ","; Opendatasoft CSV exports use ";".
 */
export async function* csvRecords(chunks, { delimiter = "," } = {}) {
  const decoder = new TextDecoder("utf-8");
  let header = null;
  let field = "";
  let row = [];
  let quoted = false;
  let pendingQuote = false; // saw a quote inside a quoted field; next char decides
  let first = true;

  const emit = function* () {
    if (!header) {
      header = row.map((h) => h.trim());
    } else if (row.length > 1 || row[0] !== "") {
      const rec = {};
      for (let i = 0; i < header.length; i++) rec[header[i]] = row[i] ?? "";
      yield rec;
    }
    row = [];
  };

  for await (const chunk of chunks) {
    let text = decoder.decode(chunk, { stream: true });
    if (first) {
      text = text.replace(/^﻿/, "");
      first = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        quoted = false; // the quote closed the field; fall through to handle c
      }
      if (quoted) {
        if (c === '"') pendingQuote = true;
        else field += c;
      } else if (c === '"' && field === "") {
        quoted = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        yield* emit();
      } else {
        field += c;
      }
    }
  }
  if (pendingQuote) quoted = false;
  if (field !== "" || row.length) {
    row.push(field);
    yield* emit();
  }
}

/** Parse a whole (small) CSV text: tests, fixtures, a downloaded export. */
export function parseCsvText(text, opts) {
  const out = [];
  const iter = csvRecords([new TextEncoder().encode(text)], opts);
  return (async () => {
    for await (const r of iter) out.push(r);
    return out;
  })();
}
