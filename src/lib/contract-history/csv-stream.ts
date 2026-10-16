/**
 * Incremental RFC 4180 CSV reader: feed it text chunks of any size (a fetch
 * body, a File.stream() in the browser) and it calls back once per record,
 * header-mapped. Quoted fields, "" escapes, CRLF and newlines inside quotes
 * are handled across chunk boundaries, so a 640 MB file never has to be one
 * string. Pure and dependency-free: runs on the server and in the browser.
 */
export class CsvStream {
  private header: string[] | null = null;
  private row: string[] = [];
  private field = "";
  private quoted = false;
  private pendingQuote = false;
  private pendingCr = false;
  private first = true;
  /** Records emitted (excluding the header). */
  count = 0;

  constructor(private readonly onRecord: (r: Record<string, string>) => void, private readonly limit = Infinity) {}

  get done(): boolean {
    return this.count >= this.limit;
  }

  push(chunk: string): void {
    if (this.done) return;
    let s = chunk;
    if (this.first) {
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
      this.first = false;
    }
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (this.pendingCr) {
        this.pendingCr = false;
        if (c === "\n") continue;
      }
      if (this.pendingQuote) {
        // The previous chunk ended on a quote inside a quoted field.
        this.pendingQuote = false;
        if (c === '"') {
          this.field += '"';
          continue;
        }
        this.quoted = false;
      }
      if (this.quoted) {
        if (c === '"') {
          if (i + 1 >= s.length) {
            this.pendingQuote = true;
          } else if (s[i + 1] === '"') {
            this.field += '"';
            i++;
          } else {
            this.quoted = false;
          }
        } else {
          this.field += c;
        }
      } else if (c === '"') {
        this.quoted = true;
      } else if (c === ",") {
        this.row.push(this.field);
        this.field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r") this.pendingCr = true;
        this.endRow();
        if (this.done) return;
      } else {
        this.field += c;
      }
    }
  }

  /** Flush the last record (a file without a trailing newline). */
  end(): void {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.quoted = false;
    }
    if (this.field !== "" || this.row.length) this.endRow();
  }

  private endRow(): void {
    this.row.push(this.field);
    const r = this.row;
    this.row = [];
    this.field = "";
    if (r.length === 1 && r[0] === "") return;
    if (!this.header) {
      this.header = r.map((h) => h.trim());
      return;
    }
    const rec: Record<string, string> = {};
    for (let i = 0; i < this.header.length; i++) rec[this.header[i]] = r[i] ?? "";
    this.count++;
    this.onRecord(rec);
  }
}

/** Read every record of a CSV string (small files, tests). */
export function readCsv(text: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const p = new CsvStream((r) => out.push(r));
  p.push(text);
  p.end();
  return out;
}

/**
 * Stream a byte stream (fetch body, File.stream()) through the CSV reader,
 * decoding UTF-8 (or Windows-1252 when asked). Stops reading early once
 * `limit` records were emitted.
 */
export async function streamCsv(
  body: ReadableStream<Uint8Array>,
  onRecord: (r: Record<string, string>) => void,
  opts: { limit?: number; encoding?: "utf-8" | "windows-1252" } = {},
): Promise<number> {
  const parser = new CsvStream(onRecord, opts.limit ?? Infinity);
  const decoder = new TextDecoder(opts.encoding ?? "utf-8");
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      if (parser.done) {
        await reader.cancel().catch(() => {});
        return parser.count;
      }
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    reader.releaseLock?.();
  }
  return parser.count;
}
