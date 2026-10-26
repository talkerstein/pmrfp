export function csvRecords(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  opts?: { delimiter?: string },
): AsyncGenerator<Record<string, string>>;
export function parseCsvText(text: string, opts?: { delimiter?: string }): Promise<Record<string, string>[]>;
