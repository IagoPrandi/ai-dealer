import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
  CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
} from "@tyche/tokenomics";
import { PublicKey } from "@solana/web3.js";
import {
  createActionRewardInstructions,
  decodeCampaignAccounts,
  decodeTokenRewardAction,
  deriveAssociatedTokenAddress,
  deriveCampaignRewardReceipt,
  parseTokenRewardActionAllowlist,
  selectTokenRewardActions,
} from "./token-reward-settlement.js";

const TYCHE_PROGRAM = key(1);
const TOKENOMICS_PROGRAM = key(2);
const AUTHORITY = key(3);
const BENEFICIARY = key(4);
const ACTION = key(5);
const CAMPAIGN = key(6);
const CAMPAIGN_VAULT = key(7);
const MINT = key(8);
const GLOBAL_CONFIG = key(9);

function key(value: number) {
  return new PublicKey(Buffer.alloc(32, value));
}

function discriminator(namespace: "account" | "global", name: string) {
  return createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

function actionData(kind: "proposal" | "supporter") {
  const data = Buffer.alloc(96);
  discriminator(
    "account",
    kind === "proposal" ? "RuleProposal" : "RuleVote",
  ).copy(data, 0);
  BENEFICIARY.toBuffer().copy(data, 24);
  return data;
}

test("decodes the beneficiary only from canonical proposal and vote accounts", () => {
  for (const kind of ["proposal", "supporter"] as const) {
    const decoded = decodeTokenRewardAction({
      action: ACTION,
      data: actionData(kind),
      kind,
    });
    assert.equal(decoded.action.toBase58(), ACTION.toBase58());
    assert.equal(decoded.beneficiary.toBase58(), BENEFICIARY.toBase58());
    assert.equal(decoded.kind, kind);
  }

  assert.throws(
    () =>
      decodeTokenRewardAction({
        action: ACTION,
        data: actionData("supporter"),
        kind: "proposal",
      }),
    /Invalid proposal reward source account/,
  );
});

test("decodes campaign zero and derives its canonical token config", () => {
  const data = Buffer.alloc(171);
  discriminator("account", "CampaignReserve").copy(data, 0);
  data.writeBigUInt64LE(0n, 8);
  MINT.toBuffer().copy(data, 16);
  CAMPAIGN_VAULT.toBuffer().copy(data, 48);
  data.writeBigUInt64LE(199_999_997_180_000_000n, 96);
  Buffer.from(CAMPAIGN_V2_ECONOMIC_CONFIG_HASH, "hex").copy(data, 105);

  const decoded = decodeCampaignAccounts({
    campaign: CAMPAIGN,
    data,
    tokenomicsProgramId: TOKENOMICS_PROGRAM,
  });
  const [expectedConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_config")],
    TOKENOMICS_PROGRAM,
  );
  assert.equal(decoded.campaign.toBase58(), CAMPAIGN.toBase58());
  assert.equal(decoded.campaignVault.toBase58(), CAMPAIGN_VAULT.toBase58());
  assert.equal(decoded.mint.toBase58(), MINT.toBase58());
  assert.equal(decoded.remainingAtoms, 199_999_997_180_000_000n);
  assert.equal(decoded.tokenConfig.toBase58(), expectedConfig.toBase58());

  data.writeBigUInt64LE(1n, 8);
  assert.throws(
    () =>
      decodeCampaignAccounts({
        campaign: CAMPAIGN,
        data,
        tokenomicsProgramId: TOKENOMICS_PROGRAM,
      }),
    /Initial Tokenomics campaign account is invalid/,
  );

  data.writeBigUInt64LE(0n, 8);
  Buffer.from(CAMPAIGN_V1_ECONOMIC_CONFIG_HASH, "hex").copy(data, 105);
  assert.throws(
    () =>
      decodeCampaignAccounts({
        campaign: CAMPAIGN,
        data,
        tokenomicsProgramId: TOKENOMICS_PROGRAM,
      }),
    /governed v2 migration is finalized/,
  );
});

test("derives classic SPL ATA and one receipt per immutable action account", () => {
  const associatedToken = deriveAssociatedTokenAddress({
    mint: MINT,
    owner: BENEFICIARY,
  });
  const [expectedAta] = PublicKey.findProgramAddressSync(
    [
      BENEFICIARY.toBuffer(),
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(),
      MINT.toBuffer(),
    ],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  );
  assert.equal(associatedToken.toBase58(), expectedAta.toBase58());

  const receipt = deriveCampaignRewardReceipt({
    action: ACTION,
    campaign: CAMPAIGN,
    tokenomicsProgramId: TOKENOMICS_PROGRAM,
  });
  const [expectedReceipt] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_reward"), CAMPAIGN.toBuffer(), ACTION.toBuffer()],
    TOKENOMICS_PROGRAM,
  );
  assert.equal(receipt.toBase58(), expectedReceipt.toBase58());
});

test("creates ATA idempotently before the exact Tyche reward CPI", () => {
  const beneficiaryTokenAccount = deriveAssociatedTokenAddress({
    mint: MINT,
    owner: BENEFICIARY,
  });
  const rewardReceipt = deriveCampaignRewardReceipt({
    action: ACTION,
    campaign: CAMPAIGN,
    tokenomicsProgramId: TOKENOMICS_PROGRAM,
  });
  const accounts = {
    beneficiaryTokenAccount,
    campaign: CAMPAIGN,
    campaignVault: CAMPAIGN_VAULT,
    globalConfig: GLOBAL_CONFIG,
    mint: MINT,
    remainingAtoms: 1_000_000_000n,
    rewardReceipt,
    tokenConfig: key(10),
  };

  const instructions = createActionRewardInstructions({
    accounts,
    action: ACTION,
    authority: AUTHORITY,
    beneficiary: BENEFICIARY,
    beneficiaryTokenAccountExists: false,
    tycheProgramId: TYCHE_PROGRAM,
    kind: "proposal",
    tokenomicsProgramId: TOKENOMICS_PROGRAM,
  });
  assert.equal(instructions.length, 2);
  assert.equal(
    instructions[0]?.programId.toBase58(),
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  );
  assert.deepEqual([...instructions[0]!.data], [1]);
  assert.equal(
    instructions[1]?.programId.toBase58(),
    TYCHE_PROGRAM.toBase58(),
  );
  assert.deepEqual(
    [...instructions[1]!.data],
    [...discriminator("global", "settle_proposal_token_reward")],
  );
  assert.deepEqual(
    instructions[1]!.keys.map(({ isSigner, isWritable, pubkey }) => ({
      isSigner,
      isWritable,
      pubkey: pubkey.toBase58(),
    })),
    [
      { isSigner: true, isWritable: true, pubkey: AUTHORITY.toBase58() },
      { isSigner: false, isWritable: false, pubkey: GLOBAL_CONFIG.toBase58() },
      { isSigner: false, isWritable: false, pubkey: ACTION.toBase58() },
      {
        isSigner: false,
        isWritable: false,
        pubkey: TOKENOMICS_PROGRAM.toBase58(),
      },
      { isSigner: false, isWritable: false, pubkey: key(10).toBase58() },
      { isSigner: false, isWritable: false, pubkey: MINT.toBase58() },
      { isSigner: false, isWritable: true, pubkey: CAMPAIGN.toBase58() },
      {
        isSigner: false,
        isWritable: true,
        pubkey: CAMPAIGN_VAULT.toBase58(),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: beneficiaryTokenAccount.toBase58(),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: rewardReceipt.toBase58(),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: "11111111111111111111111111111111",
      },
    ],
  );

  assert.equal(
    createActionRewardInstructions({
      accounts,
      action: ACTION,
      authority: AUTHORITY,
      beneficiary: BENEFICIARY,
      beneficiaryTokenAccountExists: true,
      tycheProgramId: TYCHE_PROGRAM,
      kind: "supporter",
      tokenomicsProgramId: TOKENOMICS_PROGRAM,
    }).length,
    1,
  );
});

test("parses an explicit action allowlist and rejects invalid ambiguity", () => {
  assert.equal(parseTokenRewardActionAllowlist(undefined), null);
  assert.equal(parseTokenRewardActionAllowlist(" , "), null);
  assert.deepEqual(
    parseTokenRewardActionAllowlist(
      ` ${ACTION.toBase58()}, ${CAMPAIGN.toBase58()} `,
    )?.map((address) => address.toBase58()),
    [ACTION.toBase58(), CAMPAIGN.toBase58()],
  );
  assert.throws(
    () =>
      parseTokenRewardActionAllowlist(
        `${ACTION.toBase58()},${ACTION.toBase58()}`,
      ),
    /duplicate/,
  );
  assert.throws(
    () => parseTokenRewardActionAllowlist("not-a-public-key"),
    /Invalid token reward action allowlist address/,
  );
});

test("selects only allowlisted actions in the approved order", () => {
  const proposal = decodeTokenRewardAction({
    action: ACTION,
    data: actionData("proposal"),
    kind: "proposal",
  });
  const supporter = decodeTokenRewardAction({
    action: CAMPAIGN,
    data: actionData("supporter"),
    kind: "supporter",
  });
  assert.deepEqual(
    selectTokenRewardActions({
      actions: [proposal, supporter],
      allowlist: [CAMPAIGN],
    }).map(({ action }) => action.toBase58()),
    [CAMPAIGN.toBase58()],
  );
  assert.throws(
    () =>
      selectTokenRewardActions({
        actions: [proposal],
        allowlist: [CAMPAIGN],
      }),
    /missing or invalid/,
  );
});
