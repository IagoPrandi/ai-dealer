import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePublicSolanaConfig } from "./publicRpcConfig";

test("accepts matching secure Helius devnet endpoints", () => {
  assert.deepEqual(
    resolvePublicSolanaConfig({
      rpcEndpoint: "https://devnet.helius-rpc.com/?api-key=test-key",
    }),
    {
      endpoint: "https://devnet.helius-rpc.com/?api-key=test-key",
      websocketEndpoint: "wss://devnet.helius-rpc.com/?api-key=test-key",
    },
  );
});

test("rejects missing endpoints instead of falling back to the public RPC", () => {
  assert.throws(
    () =>
      resolvePublicSolanaConfig({
        rpcEndpoint: undefined,
      }),
    /NEXT_PUBLIC_SOLANA_RPC_URL must be configured/,
  );
});

test("rejects insecure RPC protocols", () => {
  assert.throws(
    () =>
      resolvePublicSolanaConfig({
        rpcEndpoint: "http://devnet.helius-rpc.com/?api-key=test-key",
      }),
    /must use HTTPS/,
  );
});
