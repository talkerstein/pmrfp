"use client";

import { useActionState, useEffect } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang } from "@/i18n/provider";
import type { Messages } from "@/i18n/dictionaries";
import type { RosterCountry } from "@/lib/roster/rules";
import { createRosterAction, type FormState } from "@/lib/roster/actions";

type R = Messages["roster"];

/** "Add a building": name and address; the action opens the new roster. */
export function AddBuildingForm({ country, provinces, copy, errors }: { country: RosterCountry; provinces: string[]; copy: R["dash"]["add"]; errors: R["editor"]["errors"] }) {
  const lang = useLang();
  const [state, action, pending] = useActionState<FormState, FormData>(createRosterAction, {});
  useEffect(() => {
    if (state.error) toast.error(errors[state.error]);
  }, [state, errors]);

  return (
    <form action={action} className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{copy.title}</h2>
      <input type="hidden" name="lang" value={lang} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="add-name">{copy.name}</Label>
          <Input id="add-name" name="building_name" placeholder={copy.namePlaceholder} maxLength={160} required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="add-address">{copy.address}</Label>
          <Input id="add-address" name="address" maxLength={240} autoComplete="street-address" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="add-city">{copy.city}</Label>
          <Input id="add-city" name="city" maxLength={80} autoComplete="address-level2" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="add-province">{copy.province[country]}</Label>
          <select id="add-province" name="province" defaultValue="" className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
            <option value="">{copy.pick}</option>
            {provinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" className="mt-3" disabled={pending}>
        <Plus className="size-4" /> {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
