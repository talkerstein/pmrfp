"use client";

import { useActionState, useRef, useState } from "react";
import Link from "@/i18n/link";
import { Flag, ImagePlus, Loader2, Mail, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  contactSellerAction,
  reportListingAction,
  saveListingAction,
  type MarketFormState,
} from "@/lib/marketplace/actions";
import {
  CATEGORIES,
  CONDITIONS,
  COUNTRIES,
  CURRENCIES,
  FEATURED_PRICE,
  MAX_PHOTOS,
  type Category,
  type Condition,
  type Country,
  type Currency,
  type ListingPhoto,
} from "@/lib/marketplace/rules";
import { useLang, useT } from "@/i18n/provider";
import { fmt } from "@/i18n/format";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Honeypot: off-screen, not focusable, ignored by people, filled by bots. */
function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

export interface ListingFormDefaults {
  id: string | null;
  title: string;
  category: Category | "";
  condition: Condition | "";
  price: string;
  currency: Currency;
  priceOnRequest: boolean;
  description: string;
  city: string;
  regionSlug: string;
  country: Country;
  photos: ListingPhoto[];
}

/** Create / edit form. Region names arrive translated from the server. */
export function ListingForm({
  defaults,
  regions,
}: {
  defaults: ListingFormDefaults;
  regions: { slug: string; name: string; country: string }[];
}) {
  const lang = useLang();
  const t = useT("marketplaceClient");
  const [state, action, pending] = useActionState<MarketFormState, FormData>(saveListingAction, {});
  const [photos, setPhotos] = useState<ListingPhoto[]>(defaults.photos);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [onRequest, setOnRequest] = useState(defaults.priceOnRequest);
  const [country, setCountry] = useState<Country>(defaults.country);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    setUploading(true);
    let current = photos.length;
    const added: ListingPhoto[] = [];
    for (const file of Array.from(files)) {
      if (current >= MAX_PHOTOS) {
        setPhotoError(t.photoErrors.max);
        break;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/marketplace/photos", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = json.error as keyof typeof t.photoErrors;
          setPhotoError(t.photoErrors[code] ?? t.photoErrors.upload);
          break;
        }
        added.push({ url: json.url, path: json.path, width: json.width, height: json.height });
        current += 1;
      } catch {
        setPhotoError(t.photoErrors.upload);
        break;
      }
    }
    setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const regionOptions = regions.filter((r) => (country === "US" ? r.country === "USA" || r.country === "US" : r.country !== "USA" && r.country !== "US"));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="lang" value={lang} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />

      <div>
        <Label htmlFor="mk-title" className="mb-1.5">{t.form.title}</Label>
        <Input id="mk-title" name="title" required minLength={5} maxLength={120} defaultValue={defaults.title} placeholder={t.form.titleHint} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mk-category" className="mb-1.5">{t.form.category}</Label>
          <select id="mk-category" name="category" required defaultValue={defaults.category} className={SELECT}>
            <option value="" disabled>{t.form.pickCategory}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t.categories[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="mk-condition" className="mb-1.5">{t.form.condition}</Label>
          <select id="mk-condition" name="condition" required defaultValue={defaults.condition} className={SELECT}>
            <option value="" disabled>{t.form.pickCondition}</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{t.conditions[c]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <Label htmlFor="mk-price" className="mb-1.5">{t.form.price}</Label>
          <Input id="mk-price" name="price" type="number" min={0} max={1000000} step="0.01" inputMode="decimal" defaultValue={defaults.price} disabled={onRequest} />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="priceOnRequest" checked={onRequest} onChange={(e) => setOnRequest(e.target.checked)} className="size-4 accent-[#282B59]" />
            {t.form.priceOnRequest}
          </label>
        </div>
        <div>
          <Label htmlFor="mk-currency" className="mb-1.5">{t.form.currency}</Label>
          <select id="mk-currency" name="currency" defaultValue={defaults.currency} className={SELECT}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="mk-description" className="mb-1.5 flex justify-between">
          {t.form.description}
          <span className="text-xs font-normal text-muted-foreground">{t.form.descriptionHint}</span>
        </Label>
        <Textarea id="mk-description" name="description" required minLength={20} maxLength={5000} rows={7} defaultValue={defaults.description} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="mk-country" className="mb-1.5">{t.form.country}</Label>
          <select id="mk-country" name="country" value={country} onChange={(e) => setCountry(e.target.value as Country)} className={SELECT}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{t.countries[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="mk-region" className="mb-1.5">{t.form.region}</Label>
          <select id="mk-region" name="regionSlug" defaultValue={defaults.regionSlug} className={SELECT} key={country}>
            <option value="">{t.form.anyRegion}</option>
            {regionOptions.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="mk-city" className="mb-1.5">{t.form.city}</Label>
          <Input id="mk-city" name="city" maxLength={80} defaultValue={defaults.city} />
        </div>
      </div>

      <div>
        <Label className="mb-1.5 flex justify-between">
          {t.form.photos}
          <span className="text-xs font-normal text-muted-foreground">{fmt(t.form.photosHint, { n: MAX_PHOTOS })}</span>
        </Label>
        {photos.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p, i) => (
              <li key={p.path} className="relative aspect-square overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                  aria-label={t.form.remove}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? t.form.uploading : t.form.addPhotos}
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files)} />
          </label>
        )}
        {photoError && <p className="mt-2 text-sm text-destructive">{photoError}</p>}
      </div>

      {state.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t.errors[state.error] ?? t.somethingWrong}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t.form.rulesNote}{" "}
        <Link href="/marketplace/rules" className="underline">{t.form.rulesLink}</Link>.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="publish" disabled={pending || uploading}>
          {pending ? t.form.saving : t.form.publish}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending || uploading}>
          {t.form.saveDraft}
        </Button>
      </div>
    </form>
  );
}

/** Buyer → seller message (server action, email relay). */
export function ContactSeller({ slug }: { slug: string }) {
  const t = useT("marketplaceClient");
  const [state, action, pending] = useActionState<MarketFormState, FormData>(contactSellerAction, {});
  if (state.ok) {
    return <p className="rounded-xl border border-teal-300 bg-teal-50/60 px-4 py-3 text-sm">{t.contact.sent}</p>;
  }
  return (
    <form action={action} className="relative space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <Honeypot />
      <div>
        <Label htmlFor="mc-name" className="mb-1.5">{t.contact.name}</Label>
        <Input id="mc-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="mc-email" className="mb-1.5">{t.contact.email}</Label>
        <Input id="mc-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="mc-message" className="mb-1.5">{t.contact.message}</Label>
        <Textarea id="mc-message" name="message" required minLength={10} maxLength={3000} rows={4} placeholder={t.contact.placeholder} />
      </div>
      {state.error && <p className="text-sm text-destructive">{t.errors[state.error] ?? t.somethingWrong}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        <Mail className="size-4" /> {pending ? t.contact.sending : t.contact.send}
      </Button>
      <p className="text-xs text-muted-foreground">{t.contact.privacy}</p>
    </form>
  );
}

/** Report a listing to the admin. */
export function ReportListing({ slug }: { slug: string }) {
  const t = useT("marketplaceClient");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<MarketFormState, FormData>(reportListingAction, {});
  if (state.ok) return <p className="text-sm text-muted-foreground">{t.report.sent}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <Flag className="size-3.5" /> {t.report.button}
      </button>
    );
  }
  return (
    <form action={action} className="relative space-y-2.5 rounded-xl border border-border bg-card p-4">
      <input type="hidden" name="slug" value={slug} />
      <Honeypot />
      <Label htmlFor="mr-reason">{t.report.reason}</Label>
      <Textarea id="mr-reason" name="reason" required minLength={5} maxLength={1000} rows={3} />
      <Label htmlFor="mr-email">{t.report.email}</Label>
      <Input id="mr-email" name="email" type="email" maxLength={254} />
      {state.error && <p className="text-sm text-destructive">{t.errors[state.error] ?? t.somethingWrong}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{t.report.send}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t.report.cancel}</Button>
      </div>
    </form>
  );
}

/** Owner: pay to feature a listing for 14 days (Stripe Checkout). */
export function FeatureListingButton({ listingId, currency }: { listingId: string; currency: Currency }) {
  const t = useT("marketplaceClient");
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const amount = currency === "USD" ? FEATURED_PRICE.USD : FEATURED_PRICE.CAD;
  const price = lang === "fr" ? `${amount} $ ${currency}` : `$${amount} ${currency}`;

  async function go() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/marketplace/featured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col">
      <Button type="button" size="sm" variant="accent" onClick={go} disabled={busy}>
        <Star className="size-3.5" /> {busy ? t.featured.working : fmt(t.featured.button, { price })}
      </Button>
      {error && <span className="mt-1 text-xs text-destructive">{t.featured.error}</span>}
    </span>
  );
}
