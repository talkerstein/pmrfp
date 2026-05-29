import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts"],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
