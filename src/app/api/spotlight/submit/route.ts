import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { SPOTLIGHT, SPOTLIGHT_PRODUCT } from "@/lib/spotlight/config";
import { validateSpotlight } from "@/lib/spotlight/validate";
import { sendAdminSpotlightSubmission, sendSpotlightReceived } from "@/lib/email/send";

export const maxDuration = 30;

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Receives a paid buyer's article and photos and emails them to the owner for
 * review. Nothing is stored or published here: a person reads every article
 * first. The Stripe session proves the buyer paid.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "photo-upload");
  if (limited) return rateLimitResponse(limited);
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Not available right now." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "That upload was too large. Please use smaller photos." }, { status: 413 });
  }

  const sessionId = field(form, "session_id");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return NextResponse.json({ error: "Missing or invalid payment reference." }, { status: 400 });
  try {
    const cs = await getStripe().checkout.sessions.retrieve(sessionId);
    if (cs.payment_status !== "paid" || cs.metadata?.product !== SPOTLIGHT_PRODUCT) {
      return NextResponse.json({ error: "We couldn't find a paid Spotlight for this link." }, { status: 402 });
    }
  } catch {
    return NextResponse.json({ error: "We couldn't verify your payment. Please email info@pmrfp.com." }, { status: 402 });
  }

  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const submission = {
    company: field(form, "company"),
    contactName: field(form, "contactName"),
    email: field(form, "email"),
    website: field(form, "website"),
    title: field(form, "title"),
    trade: field(form, "trade"),
    city: field(form, "city"),
    province: field(form, "province"),
    article: field(form, "article"),
    consent: field(form, "consent") === "on",
  };
  const problem = validateSpotlight(submission, photos.length);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let total = 0;
  for (const p of photos) {
    if (!TYPES[p.type]) return NextResponse.json({ error: "Photos must be JPG, PNG or WebP." }, { status: 400 });
    if (p.size > SPOTLIGHT.maxPhotoBytes) return NextResponse.json({ error: "Each photo must be under 1 MB. Please resize and try again." }, { status: 400 });
    total += p.size;
  }
  if (total > SPOTLIGHT.maxTotalBytes) return NextResponse.json({ error: "Photos are too large in total. Please resize and try again." }, { status: 400 });

  const attachments = await Promise.all(
    photos.map(async (p, i) => ({ filename: `photo-${i + 1}.${TYPES[p.type]}`, content: Buffer.from(await p.arrayBuffer()) })),
  );
  await sendAdminSpotlightSubmission({ ...submission, sessionId, attachments });
  await sendSpotlightReceived(submission.email, submission.title);
  return NextResponse.json({ ok: true });
}
