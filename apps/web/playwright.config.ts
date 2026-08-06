import { defineConfig, devices } from "@playwright/test";

// Next 16 allows a single dev server per project dir. When one is already
// running (pnpm dev), point the tests at it instead of starting another:
//   TYCHE_WEB_E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
const externalBaseUrl = process.env.TYCHE_WEB_E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    ...devices["Pixel 5"],
    baseURL: externalBaseUrl || "http://127.0.0.1:3005",
    // The app registers a PWA service worker (src/app/PwaRegistrar.tsx); once
    // it controls the page it bypasses page.route() network mocks.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3005",
          reuseExistingServer: true,
          timeout: 60_000,
          url: "http://127.0.0.1:3005/play/pick",
        },
      }),
});
