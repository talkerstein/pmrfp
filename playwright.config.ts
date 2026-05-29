import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Runs against the dev server in demo mode (no Supabase needed),
 * which exercises the public gating flows end-to-end.
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
