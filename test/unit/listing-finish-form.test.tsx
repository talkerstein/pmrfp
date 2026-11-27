// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/** The one-question form on /dashboard/company/finish, in all three languages. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  useParams: () => ({}),
  usePathname: () => "/dashboard/company/finish",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/dashboard/actions", () => ({ saveListingStepAction: async () => ({}) }));
vi.mock("@/components/forms/logo-uploader", () => ({
  LogoUploader: () => <input type="hidden" name="logoUrl" data-testid="logo-uploader" />,
}));

import { ListingFinishStep, type ListingPreview } from "@/components/forms/listing-finish";
import { I18nProvider } from "@/i18n/provider";
import { clientMessages, getDictionary } from "@/i18n/dictionaries";
import { LISTING_STEPS, type ListingStep } from "@/lib/organizations/listing-steps";
import type { Locale } from "@/i18n/config";

const PREVIEW: ListingPreview = {
  name: "Northline Roofing",
  logoUrl: null,
  city: "Toronto",
  province: "Ontario",
  shortDescription: null,
  insurance: null,
  wsib: null,
  team: null,
};

function show(step: ListingStep, lang: Locale = "en", initial = "") {
  return render(
    <I18nProvider lang={lang} messages={clientMessages(lang)}>
      <ListingFinishStep step={step} initial={initial} done={3} total={9} organizationId="org-1" preview={PREVIEW} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("Finish your listing form", () => {
  it.each(["en", "fr", "es"] as const)("asks every step in %s", (lang) => {
    const t = getDictionary(lang).dashClient.finish;
    for (const step of LISTING_STEPS) {
      show(step, lang);
      expect(screen.getByRole("heading", { name: t.steps[step].title })).toBeTruthy();
      expect(screen.getByText(t.steps[step].why)).toBeTruthy();
      expect(screen.getByRole("button", { name: new RegExp(t.save) })).toBeTruthy();
      cleanup();
    }
  });

  it("sends the step and the answer, and nothing that names a company", () => {
    const { container } = show("insurance");
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fully insured" } });
    const data = new FormData(form);
    expect(data.get("step")).toBe("insurance");
    expect(data.get("value")).toBe("Fully insured");
    expect(data.get("lang")).toBe("en");
    expect([...data.keys()].some((k) => /org/i.test(k))).toBe(false);
  });

  it("shows the answer in the listing as it's typed", () => {
    show("short");
    expect(screen.getByText("Your description will show here.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Flat roofs for condos." } });
    expect(within(screen.getByRole("complementary")).getByText("Flat roofs for condos.")).toBeTruthy();
    expect(screen.queryByText("Your description will show here.")).toBeNull();
  });

  it("offers the team sizes the directory uses", () => {
    show("team");
    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["", "1-10", "11-50", "51-200", "200+"]);
  });

  it("uses the logo uploader for the logo step", () => {
    show("logo");
    expect(screen.getByTestId("logo-uploader")).toBeTruthy();
  });

  it("skips to the next question, and shows how far along the listing is", () => {
    show("insurance");
    const skip = screen.getByRole("link", { name: "Skip for now" });
    expect(skip.getAttribute("href")).toContain("/dashboard/company/finish?after=insurance");
    expect(screen.getByText("3 of 9 done")).toBeTruthy();
  });

  it("makes no promise about insurance beyond what a certificate backs up", () => {
    expect(getDictionary("en").dashClient.finish.steps.insurance.why).toMatch(/certificate/);
  });
});
