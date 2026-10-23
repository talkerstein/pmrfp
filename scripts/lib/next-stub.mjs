/**
 * Stand-in for next/cache, next/headers and react when the app's TypeScript
 * is bundled for a local script (scripts/run-open-data.mjs). The shared
 * modules import them for server rendering; a script never renders, so
 * these only need to exist and be harmless.
 */
export const unstable_cache = (fn) => fn;
export const cache = (fn) => fn;
export const revalidateTag = () => undefined;
export const revalidatePath = () => undefined;
export const cookies = async () => ({ get: () => undefined, getAll: () => [], set: () => undefined });
export const headers = async () => new Headers();
export const notFound = () => {
  throw new Error("notFound() called in a script");
};
const stub = {};
export default stub;
