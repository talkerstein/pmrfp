"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SPOTLIGHT } from "@/lib/spotlight/config";
import { wordCount } from "@/lib/spotlight/validate";

const input = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";

export function SpotlightSubmitForm({ sessionId }: { sessionId: string }) {
  const [words, setWords] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("session_id", sessionId);
    try {
      const res = await fetch("/api/spotlight/submit", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDone(true);
      else setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Upload failed. Please check your connection and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="mt-8 rounded-lg border border-teal-300 bg-teal-50/60 p-5">
        <p className="font-semibold">Got it, thank you.</p>
        <p className="mt-1 text-sm">We&apos;ll review your article and email you the link when it&apos;s live (within 2 business days).</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Company name<input name="company" required className={input} /></label>
        <label className="text-sm font-medium">Your name<input name="contactName" required className={input} /></label>
        <label className="text-sm font-medium">Email<input name="email" type="email" required className={input} /></label>
        <label className="text-sm font-medium">Website (optional)<input name="website" type="url" placeholder="https://" className={input} /></label>
      </div>
      <label className="block text-sm font-medium">Project title
        <input name="title" required minLength={10} placeholder="e.g. Roof replacement for a 120-unit condo in Mississauga" className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Trade or service<input name="trade" required placeholder="Roofing" className={input} /></label>
        <label className="text-sm font-medium">City<input name="city" required className={input} /></label>
        <label className="text-sm font-medium">Province / state<input name="province" className={input} /></label>
      </div>
      <label className="block text-sm font-medium">Your article
        <textarea
          name="article"
          required
          rows={14}
          onChange={(e) => setWords(wordCount(e.target.value))}
          placeholder={"What did the building or client need?\n\nWhat did you do, and what problems did you solve?\n\nHow did it turn out? (numbers help: units, square feet, timeline)"}
          className={input}
        />
        <span className={`mt-1 block text-xs ${words < SPOTLIGHT.minWords || words > SPOTLIGHT.maxWords ? "text-muted-foreground" : "text-teal-700"}`}>
          {words} words (aim for {SPOTLIGHT.minWords} to {SPOTLIGHT.maxWords})
        </span>
      </label>
      <label className="block text-sm font-medium">Photos (1 to {SPOTLIGHT.maxPhotos}, JPG/PNG/WebP, under 1 MB each)
        <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="mt-1 block w-full text-sm" />
      </label>
      <label className="flex gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>I confirm this is our own finished project, the photos are ours, and our client is OK with it being featured.</span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Sending…" : "Submit for review"}</Button>
    </form>
  );
}
