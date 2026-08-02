import assert from "node:assert/strict";
import { test } from "node:test";

import { address, getAddressEncoder } from "@solana/kit";
import { IDEALER_PROGRAM_ID } from "./idealerProgram.js";

import {
  createManualTokenRewardClaimInstruction,
  createLockTokensInstruction,
  createTokenomicsClaimInstruction,
  createTopUpLockInstruction,
  createUnlockTokensInstruction,
  deriveAssociatedTokenAddress,
  deriveTokenomicsTransactionAccounts,
  fetchManualTokenRewards,
  fetchOnChainTokenBalance,
  fetchOnChainTokenomicsPosition,
  IDEALER_TOKEN_MINT,
  SPL_TOKEN_PROGRAM_ID,
  TOKENOMICS_CORE_PROGRAM_ID,
} from "./tokenomicsProgram.js";

const owner = address("11111111111111111111111111111111");
const mint = "So11111111111111111111111111111111111111112";
const tokenAccount = "SysvarRent111111111111111111111111111111111";
const escrow = "SysvarC1ock11111111111111111111111111111111";

function tokenAccountData({
  amount,
  mintAddress,
  ownerAddress,
}: {
  amount: bigint;
  mintAddress: ReturnType<typeof address>;
  ownerAddress: ReturnType<typeof address>;
}) {
  const data = new Uint8Array(165);
  const encoder = getAddressEncoder();
  data.set(encoder.encode(mintAddress), 0);
  data.set(encoder.encode(ownerAddress), 32);
  new DataView(data.buffer).setBigUint64(64, amount, true);
  return Buffer.from(data).toString("base64");
}

test("lock builders serialize u64 atoms and bind Tokenomics Core", async () => {
  const create = await createLockTokensInstruction({
    amountAtoms: 400_000_000n,
    escrow,
    mint,
    owner,
    sourceTokenAccount: tokenAccount,
  });
  assert.equal(create.programAddress, TOKENOMICS_CORE_PROGRAM_ID);
  assert.equal(create.accounts.length, 9);
  assert.equal(
    new DataView(create.data.buffer).getBigUint64(8, true),
    400_000_000n,
  );

  const topUp = await createTopUpLockInstruction({
    amountAtoms: 1n,
    escrow,
    mint,
    owner,
    sourceTokenAccount: tokenAccount,
  });
  assert.equal(topUp.accounts.length, 7);

  const unlock = await createUnlockTokensInstruction({
    amountAtoms: 1n,
    escrow,
    mint,
    owner,
    returnTokenAccount: tokenAccount,
  });
  assert.equal(unlock.accounts.length, 7);
});

test("lock builders reject zero and u64 overflow", async () => {
  await assert.rejects(
    () =>
      createLockTokensInstruction({
        amountAtoms: 0n,
        escrow,
        mint,
        owner,
        sourceTokenAccount: tokenAccount,
      }),
    /unsigned 64-bit/,
  );
});

test("claim builder binds epoch, beneficiary, vaults, and proof", async () => {
  const claim = await createTokenomicsClaimInstruction({
    amountLamports: 8n,
    beneficiary: owner,
    caller: owner,
    correctionReserveVault: escrow,
    distributionVault: tokenAccount,
    epochId: 1n,
    position: mint,
    proof: ["01".repeat(32)],
    rootVersion: 1,
    treasurySolVault: owner,
  });
  assert.equal(claim.accounts.length, 9);
  assert.equal(claim.data.length, 128);
  assert.equal(new DataView(claim.data.buffer).getBigUint64(8, true), 1n);
});

test("reads the canonical on-chain JDR account without an indexer projection", async () => {
  const mintAddress = address(mint);
  const expectedTokenAccount = await deriveAssociatedTokenAddress(
    owner,
    mintAddress,
  );
  const balance = await fetchOnChainTokenBalance({
    client: {
      runtime: {
        rpc: {
          getAccountInfo(account) {
            assert.equal(account, expectedTokenAccount);
            return {
              send: async () => ({
                value: {
                  data: [
                    tokenAccountData({
                      amount: 400_000_000n,
                      mintAddress,
                      ownerAddress: owner,
                    }),
                    "base64",
                  ] as const,
                  owner: SPL_TOKEN_PROGRAM_ID,
                },
              }),
            };
          },
        },
      },
    },
    mint: mintAddress,
    owner,
  });

  assert.equal(balance.atoms, "400000000");
  assert.equal(balance.exists, true);
  assert.equal(balance.tokenAccount, expectedTokenAccount);
});

test("reports zero for a missing JDR account and rejects an invalid token owner", async () => {
  const mintAddress = address(mint);
  const missing = await fetchOnChainTokenBalance({
    client: {
      runtime: {
        rpc: {
          getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        },
      },
    },
    mint: mintAddress,
    owner,
  });
  assert.equal(missing.atoms, "0");
  assert.equal(missing.exists, false);

  await assert.rejects(
    () =>
      fetchOnChainTokenBalance({
        client: {
          runtime: {
            rpc: {
              getAccountInfo: () => ({
                send: async () => ({
                  value: {
                    data: [
                      tokenAccountData({
                        amount: 1n,
                        mintAddress,
                        ownerAddress: owner,
                      }),
                      "base64",
                    ] as const,
                    owner: TOKENOMICS_CORE_PROGRAM_ID,
                  },
                }),
              }),
            },
          },
        },
        mint: mintAddress,
        owner,
      }),
    /invalid owner/,
  );
});

function tokenConfigData() {
  const data = new Uint8Array(723);
  const encoder = getAddressEncoder();
  data.set([92, 73, 255, 43, 107, 51, 117, 101], 0);
  data.set(encoder.encode(IDEALER_TOKEN_MINT), 136);
  new DataView(data.buffer).setUint32(232, 0, true);
  data.set(encoder.encode(address(escrow)), 269);
  data.set(encoder.encode(address(tokenAccount)), 301);
  return Buffer.from(data).toString("base64");
}

test("reads lock configuration and position directly from Tokenomics Core", async () => {
  const accounts = await deriveTokenomicsTransactionAccounts(owner);
  const lockData = new Uint8Array(194);
  const encoder = getAddressEncoder();
  lockData.set([95, 235, 144, 78, 23, 171, 45, 9], 0);
  lockData.set(encoder.encode(owner), 8);
  lockData.set(encoder.encode(address(tokenAccount)), 72);
  lockData.set(encoder.encode(IDEALER_TOKEN_MINT), 136);
  new DataView(lockData.buffer).setBigUint64(168, 900_000_000n, true);

  const position = await fetchOnChainTokenomicsPosition({
    client: {
      runtime: {
        rpc: {
          getAccountInfo(account) {
            return {
              send: async () => ({
                value:
                  account === accounts.tokenConfig
                    ? {
                        data: [tokenConfigData(), "base64"] as const,
                        owner: TOKENOMICS_CORE_PROGRAM_ID,
                      }
                    : {
                        data: [Buffer.from(lockData).toString("base64"), "base64"] as const,
                        owner: TOKENOMICS_CORE_PROGRAM_ID,
                      },
              }),
            };
          },
        },
      },
    },
    owner,
  });

  assert.equal(position.lockExists, true);
  assert.equal(position.lockedAtoms, "900000000");
  assert.equal(position.treasuryLockEscrow, address(escrow));
  assert.equal(position.initialCampaignVault, address(tokenAccount));
});

test("discovers beneficiary-bound JDR rewards for a manual claim", async () => {
  const encoder = getAddressEncoder();
  const proposal = new Uint8Array(56);
  proposal.set([233, 212, 161, 38, 30, 217, 172, 177], 0);
  proposal.set(encoder.encode(owner), 24);
  const vote = new Uint8Array(56);
  vote.set([218, 17, 7, 255, 16, 223, 234, 149], 0);
  vote.set(encoder.encode(owner), 24);
  const client = {
    runtime: {
      rpc: {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        getProgramAccounts: () => ({
          send: async () => [
            {
              account: {
                data: [Buffer.from(proposal).toString("base64"), "base64"] as const,
                owner: IDEALER_PROGRAM_ID,
              },
              pubkey: tokenAccount,
            },
            {
              account: {
                data: [Buffer.from(vote).toString("base64"), "base64"] as const,
                owner: IDEALER_PROGRAM_ID,
              },
              pubkey: escrow,
            },
          ],
        }),
      },
    },
  };
  const rewards = await fetchManualTokenRewards({ client, owner });
  assert.deepEqual(
    rewards.map((reward) => [reward.kind, reward.atoms]),
    [
      ["proposal", "400000000"],
      ["supporter", "60000000"],
    ],
  );
  const instruction = await createManualTokenRewardClaimInstruction({
    campaignVault: address(tokenAccount),
    owner,
    reward: rewards[0]!,
    tokenAccount: address(tokenAccount),
  });
  assert.equal(instruction.accounts.length, 12);
  assert.deepEqual([...instruction.data], [102, 19, 56, 179, 43, 237, 219, 1]);
});
