import { test, expect } from "@playwright/test";

/**
 * Public-flow e2e (demo mode). Verifies the homepage, directory, pricing,
 * and the RFP teaser/locked-vs-full gating behave as specified.
 */

test("homepage shows hero, pricing, and the PermitClub brand bridge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Commercial Property RFPs");
  await expect(page.getByText("$249", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("From the team behind")).toBeVisible();
});

test("pricing page shows Free and Trade Pro $249", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("$249", { exact: false }).first()).toBeVisible();
});

test("directory lists vendors and filters by category", async ({ page }) => {
  await page.goto("/directory");
  await expect(page.getByRole("link", { name: /Northline Electrical/ })).toBeVisible();
  await page.goto("/directory?category=hvac");
  await expect(page.getByRole("link", { name: /Summit Mechanical/ })).toBeVisible();
});

test("vendor profile renders", async ({ page }) => {
  await page.goto("/directory/northline-electrical");
  await expect(page.getByRole("heading", { name: /Northline Electrical/ })).toBeVisible();
});

test("RFP board lists opportunities", async ({ page }) => {
  await page.goto("/rfps");
  await expect(page.getByRole("link", { name: /Condominium Electrical Maintenance/ })).toBeVisible();
});

test("RFP detail: full member view in demo, locked view with ?view=locked", async ({ page }) => {
  await page.goto("/rfps/condominium-electrical-maintenance-contract");
  // Full member view shows the gated scope content.
  await expect(page.getByText("Project scope")).toBeVisible();
  await expect(page.getByRole("button", { name: /Express Interest/ })).toBeVisible();

  // Locked visitor view shows the subscribe panel instead.
  await page.goto("/rfps/condominium-electrical-maintenance-contract?view=locked");
  await expect(page.getByText("Subscribe to view the full opportunity")).toBeVisible();
});

test("resources hub renders an article", async ({ page }) => {
  await page.goto("/resources");
  await page.getByRole("link", { name: /How Commercial Property RFPs Work/ }).click();
  await expect(page.getByRole("heading", { name: /How Commercial Property RFPs Work/ })).toBeVisible();
});
