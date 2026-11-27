import { createHash, timingSafeEqual } from "node:crypto";

export function cronAuthFailure(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): 401 | 503 | null {
  if (!secret?.trim()) return 503;
  if (!authorization) return 401;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received) ? null : 401;
}
