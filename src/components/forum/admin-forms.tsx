"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appointModAction, type ForumFormState } from "@/lib/forum/actions";

/** Admin-only (English, like the rest of /admin). */
export function AppointModForm({ categories }: { categories: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(appointModAction, {} as ForumFormState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Input name="handle" placeholder="member handle" required className="w-48" />
      <select name="category" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
        {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="remove" value="1" /> remove</label>
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      {state.error && <span className="text-sm text-destructive">Error: {state.error}</span>}
      {state.ok && <span className="text-sm text-teal-700">Saved.</span>}
    </form>
  );
}
