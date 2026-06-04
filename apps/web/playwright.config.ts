import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    ...devices["Pixel 5"],
    baseURL: "http://127.0.0.1:3005",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3005",
    reuseExistingServer: true,
    timeout: 60_000,
    url: "http://127.0.0.1:3005/play/pick",
  },
});
