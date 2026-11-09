import type { BoardRow } from "./board-snapshot";

/** Preserve the source's complete ordered projection, including removals and categories. */
export function matchingBoard(source: BoardRow[], candidate: unknown): BoardRow[] | null {
  if (!candidate || typeof candidate !== "object" || !("items" in candidate) ||
    !Array.isArray(candidate.items) || !("next" in candidate) || candidate.next !== null ||
    !source.length || candidate.items.length !== source.length) return null;

  const rows: BoardRow[] = [];
  for (const [index, actual] of candidate.items.entries()) {
    const { categoryIds, ...expected } = source[index];
    if (!actual || typeof actual !== "object" || Array.isArray(actual) ||
      !Array.isArray(actual.categoryIds) || actual.categoryIds.length !== categoryIds.length ||
      categoryIds.some((id, i) => id !== actual.categoryIds[i])) return null;

    const fields = Object.entries(expected);
    if (fields.some(([field, value]) => !Object.hasOwn(actual, field) || !Object.is(actual[field], value))) return null;
    rows.push({
      ...Object.fromEntries(fields.map(([field]) => [field, actual[field]])),
      categoryIds: [...actual.categoryIds],
    } as BoardRow);
  }
  return rows;
}
