import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupportedTycheWallet } from "./walletDiscovery";

test("supports Solana wallet-standard wallets", () => {
  assert.equal(
    isSupportedTycheWallet({
      chains: ["solana:devnet"],
      features: {
        "solana:signTransaction": {},
        "standard:connect": {},
      },
      name: "Phantom",
    }),
    true,
  );
});

test("rejects non-Solana wallets", () => {
  assert.equal(
    isSupportedTycheWallet({
      chains: ["eip155:1"],
      features: {
        "standard:connect": {},
      },
      name: "Ethereum Wallet",
    }),
    false,
  );
});

test("rejects MetaMask even if it advertises Solana features", () => {
  assert.equal(
    isSupportedTycheWallet({
      chains: ["solana:devnet"],
      features: {
        "solana:signTransaction": {},
        "standard:connect": {},
      },
      name: "MetaMask",
    }),
    false,
  );
});

test("rejects MetaMask name variants", () => {
  assert.equal(
    isSupportedTycheWallet({
      chains: ["solana:devnet"],
      features: {
        "solana:signTransaction": {},
        "standard:connect": {},
      },
      name: "Meta Mask Wallet",
    }),
    false,
  );
});
