# PMRFP Image Generation Workflow

> Locked 2026-05-31 per Rishon: default to ChatGPT Image 2 via browser. The
> API-based generator (Krea / GPT Image 2 MCP) is a fallback only when explicitly
> approved per session.

## Why Chrome → ChatGPT

- **Zero credit burn** — uses Rishon's ChatGPT Plus subscription (already paid)
- **Same model** — ChatGPT's image generator IS GPT Image 2
- **Slightly slower per image** (~45-90 sec via browser vs ~30 sec via API)
- **No silent rate limits** — ChatGPT will tell you if you've hit your daily cap

## The default workflow

### When I need to generate an image

1. **Always check the cache first** (`briefs/image-cache/manifest.json`).
   - Compute SHA-256 of the prompt
   - If hash present → use the cached Supabase URL, skip generation entirely
   - If absent → proceed to step 2

2. **Drive ChatGPT in Chrome**
   - Use the `Claude in Chrome` MCP (already connected)
   - Navigate to `https://chat.openai.com/?model=gpt-image-2` (or new chat)
   - Send the prompt as a message: `"Generate an image: {full prompt}"`
   - Wait for the image to render (~45-90 sec)
   - Right-click → "Copy image address" OR use `javascript_tool` to extract the
     image URL from the DOM (typically an `https://files.oaiusercontent.com/...` URL)
   - Download the bytes

3. **Upload to Supabase Storage**
   - Path: `pmrfp-system/{slug}/{uuid}.png` (or webp)
   - Bucket: `rfp-photos` (public)
   - Get the public URL back

4. **Record in cache manifest**
   - Append `{prompt_hash: {supabase_url, prompt, generated_at, model, rfp_slug?}}`
   - Commit manifest to repo (binary images stay gitignored)

5. **Insert/update `rfp_documents` row** if attaching to an RFP
   - Uses the Supabase URL, NOT the original ChatGPT URL (those expire)

### When I should fall back to GPT Image 2 API (Krea MCP)

ONLY when Rishon explicitly approves in the current session
("use the API today — ChatGPT is too slow", or similar). Default behavior:
ALWAYS Chrome → ChatGPT first.

## Brand prompt template (always-on prefix)

Every PMRFP image generation must include this style suffix:

> "Cool color grading with subtle indigo undertones; slightly muted,
> professional property-listing photography aesthetic. No visible signage or
> logos, no license plates, no people in frame. Crisp focus, 35mm-equivalent
> focal length, daylight balanced. Realistic — no glowing windows, no fake
> reflections, no AI symmetry artifacts."

Plus the per-image specifics (subject, location, framing).

## Aspect ratios

| Use case | Aspect | Resolution |
|---|---|---|
| RFP card hero | 16:9 | 2k |
| RFP detail gallery | 16:9 | 2k |
| Open Graph card | 16:9 | 2k (1200x630 final) |
| Trade portfolio | 4:3 | 2k |
| Trade logo (future) | 1:1 | 1k |

## Caching architecture

See `briefs/image-cache/manifest.json`. Three layers:

1. **Prompt-hash cache (committed)** — manifest.json. If we ever regenerate the
   same prompt, we use the existing Supabase URL. Source of truth across machines.
2. **Supabase Storage (live)** — the actual image bytes, public, CDN-fronted by
   Supabase. Persistent forever (until deleted).
3. **Browser/CDN cache (downstream)** — Supabase serves
   `Cache-Control: max-age=3600` by default on public objects, augmented at the
   edge by Vercel image optimization when we route through `next/image`.

## What NOT to do

- Don't generate images speculatively. Always tie a gen to a specific RFP slug,
  trade profile, OG route, or other concrete destination
- Don't generate during a smoke test or build verification (cache miss = real
  cost; defer the gen to the actual workflow)
- Don't store ChatGPT's original `files.oaiusercontent.com` URL anywhere
  long-lived — those URLs expire. Always re-upload to Supabase first
- Don't bypass the brand prompt suffix
- Don't gen at 4k unless explicitly requested — 2k is the standard and ~3x
  cheaper

## Future automation

When time permits, build a small wrapper that drives the Chrome → ChatGPT
flow end-to-end as a single tool call:

```
generateBrandImage({
  prompt: "Documentary commercial photograph of...",
  aspect: "16:9",
  resolution: "2k",
  destination: { type: "rfp", slug: "..." } | { type: "og", route: "..." } | { type: "trade", slug: "..." }
})
```

Returns: Supabase URL. Internally: cache check → Chrome drive → download →
upload → manifest update.

Not built today — manual workflow first, automate once it proves out.
