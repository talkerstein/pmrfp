/** Test runtime uses Node 24+; the application retains its Node 20 type baseline. */
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    close(): void;
    prepare(sql: string): {
      get(...values: (string|number|null)[]): Record<string, unknown>|undefined;
      all(...values: (string|number|null)[]): Record<string, unknown>[];
      run(...values: (string|number|null)[]): {changes: number|bigint};
    };
  }
}
