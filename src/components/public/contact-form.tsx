"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [requestType, setRequestType] = useState("general_contact");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          organization: fd.get("organization") || undefined,
          message: fd.get("message"),
          company_website: fd.get("company_website") ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      toast.success("Message sent — we'll be in touch.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-medium text-success">Thanks — your message has been sent.</p>
        <p className="mt-1 text-sm text-muted-foreground">We&apos;ll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input name="name" required /></Field>
        <Field label="Email"><Input name="email" type="email" required /></Field>
        <Field label="Phone (optional)"><Input name="phone" /></Field>
        <Field label="Organization (optional)"><Input name="organization" /></Field>
      </div>
      <Field label="I'm reaching out as">
        <Select value={requestType} onValueChange={(v) => setRequestType(v ?? "general_contact")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general_contact">General inquiry</SelectItem>
            <SelectItem value="property_manager_help">Property manager — need sourcing help</SelectItem>
            <SelectItem value="vendor_question">Trade / vendor question</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Message"><Textarea name="message" rows={5} required /></Field>
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
