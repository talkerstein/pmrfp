"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function RequestIntroForm({
  vendorSlug,
  vendorName,
}: {
  vendorSlug: string;
  vendorName: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: "directory_intro",
          name: fd.get("name"),
          email: fd.get("email"),
          message: fd.get("message") || `Introduction request for ${vendorName}.`,
          targetOrganizationId: vendorSlug,
          company_website: fd.get("company_website") ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success("Request sent", { description: `We'll pass your request along to ${vendorName}.` });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="text-sm text-success">Thanks — your introduction request has been sent.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input name="name" placeholder="Your name" required />
      <Input name="email" type="email" placeholder="Your email" required />
      <Textarea name="message" placeholder={`Tell ${vendorName} a bit about your project (optional)`} rows={3} />
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Sending…" : "Request introduction"}
      </Button>
    </form>
  );
}
