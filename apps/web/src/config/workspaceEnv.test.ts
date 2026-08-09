import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { loadWorkspaceEnvironment } from "./workspaceEnv";

test("loads the monorepo root env without overriding injected values", () => {
  const processEnv: Record<string, string> = {
    NEXT_PUBLIC_SOLANA_RPC_URL: "https://injected.example",
  };
  let loadedPath = "";

  loadWorkspaceEnvironment("C:/workspace", {
    load: (options) => {
      loadedPath = String(options.path);
      const target = options.processEnv as Record<string, string>;
      target.NEXT_PUBLIC_SOLANA_RPC_URL ??= "https://file.example";
      target.NEXT_PUBLIC_TYCHE_API_URL = "https://api.example";
      return { parsed: {} };
    },
    processEnv,
  });

  assert.equal(loadedPath, path.join("C:/workspace", ".env"));
  assert.equal(
    processEnv.NEXT_PUBLIC_SOLANA_RPC_URL,
    "https://injected.example",
  );
  assert.equal(processEnv.NEXT_PUBLIC_TYCHE_API_URL, "https://api.example");
});

test("allows an injected environment when the optional root env file is absent", () => {
  assert.doesNotThrow(() =>
    loadWorkspaceEnvironment("C:/workspace", {
      load: () => {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        return { error };
      },
      processEnv: {},
    }),
  );
});

test("surfaces unexpected root env loading failures", () => {
  const error = new Error("permission denied") as NodeJS.ErrnoException;
  error.code = "EACCES";

  assert.throws(
    () =>
      loadWorkspaceEnvironment("C:/workspace", {
        load: () => ({ error }),
        processEnv: {},
      }),
    error,
  );
});
