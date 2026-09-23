import { GoogleGenAI } from "@google/genai";

/**
 * One Gemini client for every AI feature (RFP Writer, bid checklist).
 * Free-tier Flash is often "high demand" (503) — callers try the next model in
 * their list instead of waiting. The SDK retries 5× with backoff by default,
 * which on a busy model is a minute of waiting; retry once, then move on.
 */
let _client: GoogleGenAI | null = null;

export function geminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _client ??= new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 30_000, retryOptions: { attempts: 2, initialDelay: 1 } },
  });
  return _client;
}

export function geminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** True when an error is a quota / rate-limit response (stop a batch, don't burn the next model). */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg);
}
