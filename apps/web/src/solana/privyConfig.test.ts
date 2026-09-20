import assert from "node:assert/strict";
import test from "node:test";

import { resolvePrivyAppId } from "./privyConfig";

test("uses the configured Privy application id", () => {
  assert.equal(
    resolvePrivyAppId({
      appId: "  cl_app_123  ",
      deploymentEnvironment: "production",
      nodeEnvironment: "production",
    }),
    "cl_app_123",
  );
});

test("keeps local external-wallet development available without Privy", () => {
  assert.equal(
    resolvePrivyAppId({
      appId: undefined,
      deploymentEnvironment: undefined,
      nodeEnvironment: "development",
    }),
    null,
  );
});

test("fails closed when a production deployment is missing Privy", () => {
  assert.throws(
    () =>
      resolvePrivyAppId({
        appId: "",
        deploymentEnvironment: "production",
        nodeEnvironment: "production",
      }),
    /NEXT_PUBLIC_PRIVY_APP_ID is required in production/,
  );
});

test("also fails closed for a non-Vercel production runtime", () => {
  assert.throws(
    () =>
      resolvePrivyAppId({
        appId: undefined,
        deploymentEnvironment: undefined,
        nodeEnvironment: "production",
      }),
    /NEXT_PUBLIC_PRIVY_APP_ID is required in production/,
  );
});
