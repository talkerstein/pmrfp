/**
 * A tiny in-memory stand-in for the supabase-js query builder, enough for
 * the dedupe code: select / insert / update / upsert with eq, neq, in, is,
 * ilike, order, limit, single, maybeSingle, count+head. A table missing from
 * `tables` answers like a missing relation (42P01).
 */
type Row = Record<string, unknown>;

export interface FakeDbOptions {
  /** Return an error for an insert/upsert that breaks a unique rule. */
  unique?: Record<string, (existing: Row, incoming: Row) => boolean>;
  /** Column defaults applied on insert (like the DB's). */
  defaults?: Record<string, Row>;
}

export interface FakeDb {
  tables: Record<string, Row[]>;
  calls: { table: string; op: string; patch?: Row }[];
  from: (table: string) => Builder;
  auth: { admin: Record<string, ReturnType<typeof makeSpy>> };
}

function makeSpy(impl: (...args: unknown[]) => unknown = () => ({ data: {}, error: null })) {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve(impl(...args));
  };
  fn.calls = calls;
  return fn;
}

function likeToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "%") out += ".*";
    else if (c === "_") out += ".";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, "is");
}

class Builder implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private filters: ((r: Row) => boolean)[] = [];
  private patch: Row | Row[] | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private head = false;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private db: FakeDb, private table: string, private opts: FakeDbOptions) {}

  select(_cols?: string, o?: { count?: string; head?: boolean }) {
    if (o?.count) this.wantCount = true;
    if (o?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.patch = rows;
    return this;
  }
  upsert(rows: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.patch = rows;
    this.upsertOpts = o;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  ilike(c: string, pattern: string) {
    const re = likeToRegex(pattern);
    this.filters.push((r) => typeof r[c] === "string" && re.test(r[c] as string));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single<T>() {
    this.mode = "single";
    return this as unknown as Builder & PromiseLike<{ data: T; error: unknown }>;
  }
  maybeSingle<T>() {
    this.mode = "maybe";
    return this as unknown as Builder & PromiseLike<{ data: T | null; error: unknown }>;
  }
  returns() {
    return this;
  }

  private run(): { data: unknown; error: unknown; count?: number | null } {
    const rows = this.db.tables[this.table];
    this.db.calls.push({ table: this.table, op: this.op, ...(this.patch && !Array.isArray(this.patch) ? { patch: this.patch } : {}) });
    if (!rows) return { data: null, error: { code: "42P01", message: `relation "public.${this.table}" does not exist` } };
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "select") out = rows.filter(match);
    if (this.op === "update") {
      out = rows.filter(match);
      for (const r of out) Object.assign(r, this.patch);
    }
    if (this.op === "insert" || this.op === "upsert") {
      const incoming = (Array.isArray(this.patch) ? this.patch : [this.patch!]).map((r) => ({ id: `id-${Math.random().toString(36).slice(2, 10)}`, ...this.opts.defaults?.[this.table], ...r }));
      const unique = this.opts.unique?.[this.table];
      for (const r of incoming) {
        const clash = unique ? rows.find((e) => unique(e, r)) : undefined;
        if (clash) {
          if (this.op === "upsert") {
            if (!this.upsertOpts.ignoreDuplicates) Object.assign(clash, r, { id: clash.id });
            continue;
          }
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        rows.push(r);
        out.push(r);
      }
    }
    if (this.max !== null) out = out.slice(0, this.max);
    const count = this.wantCount ? out.length : null;
    if (this.head) return { data: null, error: null, count };
    if (this.mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } };
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out.map((r) => ({ ...r })), error: null, count };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function fakeDb(tables: Record<string, Row[]>, opts: FakeDbOptions = {}): FakeDb {
  const db: FakeDb = {
    tables,
    calls: [],
    from: (table: string) => new Builder(db, table, opts),
    auth: {
      admin: {
        updateUserById: makeSpy(),
        deleteUser: makeSpy(() => ({ data: {}, error: null })),
        getUserById: makeSpy(() => ({ data: { user: null }, error: null })),
      },
    },
  };
  return db;
}
