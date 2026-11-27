// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The hand-off from the try-it box to the account: only a list the visitor
 * really pasted is kept, it stays in this browser, and the tracker's import
 * panel offers it after sign-up without importing anything on its own.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  useParams: () => ({}),
  usePathname: () => "/vendor-insurance-tracker",
}));
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: { href: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/vendor-certs/actions", () => ({
  deleteCertificateAction: async () => ({}),
  importCertificatesAction: async () => ({}),
  requestCertificateAction: async () => ({}),
  saveCertificateAction: async () => ({}),
}));

import { TrackerDemo } from "@/components/vendor-certs/tracker-demo";
import { VendorCertTracker } from "@/components/vendor-certs/tracker";
import { I18nProvider } from "@/i18n/provider";
import { clientMessages, getDictionary } from "@/i18n/dictionaries";
import { VENDOR_LIST_DRAFT_KEY } from "@/lib/vendor-certs/rules";

const d = getDictionary("en").certs.demo;
const note = getDictionary("en").certsClient.import.draftKept;

function renderDemo() {
  render(
    <I18nProvider lang="en" messages={clientMessages("en")}>
      <TrackerDemo t={d} country="CA" today="2026-11-04" ctaHref="/sign-up" />
    </I18nProvider>,
  );
  return { box: screen.getByLabelText(d.label) as HTMLTextAreaElement, keep: screen.getByRole("link", { name: new RegExp(d.keep) }) };
}

function renderTracker() {
  render(
    <I18nProvider lang="en" messages={clientMessages("en")}>
      <VendorCertTracker rows={[]} country="CA" types={["general_liability", "wsib_clearance"]} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("try-it box hand-off", () => {
  it("does not keep the sample", () => {
    const { keep } = renderDemo();
    fireEvent.click(keep);
    expect(window.localStorage.getItem(VENDOR_LIST_DRAFT_KEY)).toBeNull();
  });

  it("keeps a pasted list when the visitor goes on to sign up", () => {
    const { box, keep } = renderDemo();
    fireEvent.change(box, { target: { value: "Northline Roofing\nMaple Plumbing" } });
    expect(window.localStorage.getItem(VENDOR_LIST_DRAFT_KEY)).toBeNull();
    fireEvent.click(keep);
    expect(window.localStorage.getItem(VENDOR_LIST_DRAFT_KEY)).toBe("Northline Roofing\nMaple Plumbing");
  });

  it("drops an old list when the box is emptied", () => {
    window.localStorage.setItem(VENDOR_LIST_DRAFT_KEY, "Old Vendor");
    const { box, keep } = renderDemo();
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.click(keep);
    expect(window.localStorage.getItem(VENDOR_LIST_DRAFT_KEY)).toBeNull();
  });

  it("shows the paste's results as it changes", () => {
    const { box } = renderDemo();
    expect(screen.getByText("3 of 4 need attention")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Vendor,Expiry\nNorthline Roofing,2027-06-30" } });
    expect(screen.getByText(fmtAllGood(1))).toBeTruthy();
  });
});

function fmtAllGood(total: number) {
  return d.allGood.replace("{total}", String(total));
}

describe("tracker import panel", () => {
  it("offers a kept list in the paste box, ready to import", () => {
    window.localStorage.setItem(VENDOR_LIST_DRAFT_KEY, "Northline Roofing");
    renderTracker();
    expect(screen.getByText(note)).toBeTruthy();
    const box = document.querySelector('textarea[name="csv"]') as HTMLTextAreaElement;
    expect(box.value).toBe("Northline Roofing");
    expect(box.closest("details")?.open).toBe(true);
  });

  it("stays closed and empty without one", () => {
    renderTracker();
    expect(screen.queryByText(note)).toBeNull();
    const box = document.querySelector('textarea[name="csv"]') as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect(box.closest("details")?.open).toBe(false);
  });
});
