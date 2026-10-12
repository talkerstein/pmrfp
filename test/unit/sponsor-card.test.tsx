import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SponsorCard } from "@/components/sponsors/sponsor-card";
import { pickSponsorUnit } from "@/lib/sponsors/pick";
import common from "@/i18n/messages/common";
import type { PaidSponsor } from "@/lib/sponsors/model";

const paid: PaidSponsor = {
  id: "1",
  slug: "acme-surety",
  name: "Acme Surety",
  logoUrl: "https://acmesurety.ca/logo.png",
  url: "https://acmesurety.ca",
  headline: "Bid bonds in 48 hours",
  message: "Surety bonds for growing contractors.",
  cta: "Get a quote",
  headlineFr: "Cautions en 48 heures",
  messageFr: "Cautionnement pour entrepreneurs.",
  ctaFr: "Soumission",
  tier: "province",
  country: "CA",
  trades: ["electrical"],
  regions: ["Quebec"],
  startDate: "2026-01-01",
  endDate: null,
  status: "approved",
};

describe("SponsorCard", () => {
  for (const lang of ["en", "fr", "es"] as const) {
    it(`is labelled in ${lang} and every link is rel=sponsored via /go`, () => {
      const unit = pickSponsorUnit({ placement: "rfp_detail", categories: ["Electrical"], province: "QC", seed: "s" }, [paid], lang);
      expect(unit).not.toBeNull();
      const label = common[lang].sponsor[unit!.label];
      const html = renderToStaticMarkup(<SponsorCard unit={unit!} label={label} />);
      expect(html).toContain(`>${label}<`);
      expect(html).toContain(`aria-label="${label}: Acme Surety"`);
      const links = html.match(/<a [^>]*>/g) ?? [];
      expect(links).toHaveLength(1);
      expect(links[0]).toContain('rel="sponsored noopener"');
      expect(links[0]).toContain('href="/go/acme-surety?p=rfp_detail&amp;t=electrical&amp;r=quebec"');
      // No third-party scripts or tracking pixels in the unit.
      expect(html).not.toMatch(/<script|<iframe/);
    });
  }
});
