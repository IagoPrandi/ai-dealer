import { createHash } from "node:crypto";
import bs58 from "bs58";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTurnAutomationConfig,
  stringifySimulationError,
  type TurnAutomationConfig,
} from "./turn-automation.js";

const DEFAULT_COMMITMENT: Commitment = "finalized";
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_REWARDS_PER_PASS = 20;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

const SETTLE_PROPOSAL_TOKEN_REWARD_DISCRIMINATOR = Buffer.from([
  102, 19, 56, 179, 43, 237, 219, 1,
]);
const SETTLE_SUPPORTER_TOKEN_REWARD_DISCRIMINATOR = Buffer.from([
  178, 202, 23, 241, 117, 160, 209, 179,
]);
const RULE_PROPOSAL_DISCRIMINATOR = accountDiscriminator("RuleProposal");
const RULE_VOTE_DISCRIMINATOR = accountDiscriminator("RuleVote");
const CAMPAIGN_RESERVE_DISCRIMINATOR = accountDiscriminator("CampaignReserve");

export type ActionRewardKind = "proposal" | "supporter";

export interface TokenRewardAction {
  action: PublicKey;
  beneficiary: PublicKey;
  kind: ActionRewardKind;
}

export interface TokenRewardSettlementConfig {
  actionAllowlist: readonly PublicKey[] | null;
  automation: TurnAutomationConfig;
  enabled: boolean;
  intervalMs: number;
  maxRewardsPerPass: number;
  tokenomicsProgramId: PublicKey | null;
}

export type TokenRewardSettlementResult =
  | { action: "disabled" | "nothing_to_settle" }
  | {
      action: "settled";
      rewards: Array<{
        beneficiary: string;
        kind: ActionRewardKind;
        receipt: string;
        signature: string;
      }>;
    };

export interface CampaignAccounts {
  campaign: PublicKey;
  campaignVault: PublicKey;
  mint: PublicKey;
  remainingAtoms: bigint;
  tokenConfig: PublicKey;
}

interface ActionRewardAccounts extends CampaignAccounts {
  beneficiaryTokenAccount: PublicKey;
  globalConfig: PublicKey;
  rewardReceipt: PublicKey;
}

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseTokenRewardActionAllowlist(value: string | undefined) {
  const addresses = value
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (!addresses || addresses.length === 0) {
    return null;
  }
  if (new Set(addresses).size !== addresses.length) {
    throw new Error("Token reward action allowlist contains a duplicate.");
  }
  return addresses.map((address) => {
    try {
      return new PublicKey(address);
    } catch {
      throw new Error(
        `Invalid token reward action allowlist address: ${address}.`,
      );
    }
  });
}

export function selectTokenRewardActions({
  actions,
  allowlist,
}: {
  actions: readonly TokenRewardAction[];
  allowlist: readonly PublicKey[] | null;
}) {
  if (!allowlist) {
    return [...actions];
  }
  const actionsByAddress = new Map(
    actions.map((action) => [action.action.toBase58(), action]),
  );
  return allowlist.map((allowedAddress) => {
    const action = actionsByAddress.get(allowedAddress.toBase58());
    if (!action) {
      throw new Error(
        `Allowlisted token reward action is missing or invalid: ${allowedAddress.toBase58()}.`,
      );
    }
    return action;
  });
}

function accountDiscriminator(name: string) {
  return createHash("sha256")
    .update(`account:${name}`)
    .digest()
    .subarray(0, 8);
}

function u64Le(value: bigint) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function derivePda(programId: PublicKey, seeds: Array<Buffer | Uint8Array>) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  )[0];
}

export function deriveAssociatedTokenAddress({
  mint,
  owner,
}: {
  mint: PublicKey;
  owner: PublicKey;
}) {
  return derivePda(ASSOCIATED_TOKEN_PROGRAM_ID, [
    owner.toBuffer(),
    TOKEN_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ]);
}

export function deriveCampaignRewardReceipt({
  action,
  campaign,
  tokenomicsProgramId,
}: {
  action: PublicKey;
  campaign: PublicKey;
  tokenomicsProgramId: PublicKey;
}) {
  return derivePda(tokenomicsProgramId, [
    Buffer.from("campaign_reward"),
    campaign.toBuffer(),
    action.toBuffer(),
  ]);
}

export function decodeTokenRewardAction({
  action,
  data,
  kind,
}: {
  action: PublicKey;
  data: Uint8Array;
  kind: ActionRewardKind;
}): TokenRewardAction {
  const bytes = Buffer.from(data);
  const expected =
    kind === "proposal"
      ? RULE_PROPOSAL_DISCRIMINATOR
      : RULE_VOTE_DISCRIMINATOR;
  if (bytes.length < 56 || !bytes.subarray(0, 8).equals(expected)) {
    throw new Error(`Invalid ${kind} reward source account.`);
  }
  return {
    action,
    beneficiary: new PublicKey(bytes.subarray(24, 56)),
    kind,
  };
}

export function decodeCampaignAccounts({
  campaign,
  data,
  tokenomicsProgramId,
}: {
  campaign: PublicKey;
  data: Uint8Array;
  tokenomicsProgramId: PublicKey;
}): CampaignAccounts {
  const bytes = Buffer.from(data);
  if (
    bytes.length < 104 ||
    !bytes.subarray(0, 8).equals(CAMPAIGN_RESERVE_DISCRIMINATOR) ||
    bytes.readBigUInt64LE(8) !== 0n
  ) {
    throw new Error("Initial Tokenomics campaign account is invalid.");
  }
  return {
    campaign,
    campaignVault: new PublicKey(bytes.subarray(48, 80)),
    mint: new PublicKey(bytes.subarray(16, 48)),
    remainingAtoms: bytes.readBigUInt64LE(96),
    tokenConfig: derivePda(tokenomicsProgramId, [Buffer.from("token_config")]),
  };
}

export function createAssociatedTokenInstruction({
  associatedToken,
  mint,
  owner,
  payer,
}: {
  associatedToken: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  payer: PublicKey;
}) {
  return new TransactionInstruction({
    data: Buffer.from([1]),
    keys: [
      { isSigner: true, isWritable: true, pubkey: payer },
      { isSigner: false, isWritable: true, pubkey: associatedToken },
      { isSigner: false, isWritable: false, pubkey: owner },
      { isSigner: false, isWritable: false, pubkey: mint },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });
}

export function createActionRewardInstruction({
  accounts,
  action,
  authority,
  idealerProgramId,
  kind,
  tokenomicsProgramId,
}: {
  accounts: ActionRewardAccounts;
  action: PublicKey;
  authority: PublicKey;
  idealerProgramId: PublicKey;
  kind: ActionRewardKind;
  tokenomicsProgramId: PublicKey;
}) {
  return new TransactionInstruction({
    data:
      kind === "proposal"
        ? SETTLE_PROPOSAL_TOKEN_REWARD_DISCRIMINATOR
        : SETTLE_SUPPORTER_TOKEN_REWARD_DISCRIMINATOR,
    keys: [
      { isSigner: true, isWritable: true, pubkey: authority },
      { isSigner: false, isWritable: false, pubkey: accounts.globalConfig },
      { isSigner: false, isWritable: false, pubkey: action },
      { isSigner: false, isWritable: false, pubkey: tokenomicsProgramId },
      { isSigner: false, isWritable: false, pubkey: accounts.tokenConfig },
      { isSigner: false, isWritable: false, pubkey: accounts.mint },
      { isSigner: false, isWritable: true, pubkey: accounts.campaign },
      {
        isSigner: false,
        isWritable: true,
        pubkey: accounts.campaignVault,
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: accounts.beneficiaryTokenAccount,
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: accounts.rewardReceipt,
      },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
    ],
    programId: idealerProgramId,
  });
}

export function createActionRewardInstructions({
  accounts,
  action,
  authority,
  beneficiary,
  beneficiaryTokenAccountExists,
  idealerProgramId,
  kind,
  tokenomicsProgramId,
}: {
  accounts: ActionRewardAccounts;
  action: PublicKey;
  authority: PublicKey;
  beneficiary: PublicKey;
  beneficiaryTokenAccountExists: boolean;
  idealerProgramId: PublicKey;
  kind: ActionRewardKind;
  tokenomicsProgramId: PublicKey;
}) {
  const instructions: TransactionInstruction[] = [];
  if (!beneficiaryTokenAccountExists) {
    instructions.push(
      createAssociatedTokenInstruction({
        associatedToken: accounts.beneficiaryTokenAccount,
        mint: accounts.mint,
        owner: beneficiary,
        payer: authority,
      }),
    );
  }
  instructions.push(
    createActionRewardInstruction({
      accounts,
      action,
      authority,
      idealerProgramId,
      kind,
      tokenomicsProgramId,
    }),
  );
  return instructions;
}

async function listRewardActions(
  connection: Connection,
  idealerProgramId: PublicKey,
) {
  const [proposals, votes] = await Promise.all([
    connection.getProgramAccounts(idealerProgramId, {
      commitment: DEFAULT_COMMITMENT,
      filters: [
        {
          memcmp: {
            bytes: bs58.encode(RULE_PROPOSAL_DISCRIMINATOR),
            offset: 0,
          },
        },
      ],
    }),
    connection.getProgramAccounts(idealerProgramId, {
      commitment: DEFAULT_COMMITMENT,
      filters: [
        {
          memcmp: {
            bytes: bs58.encode(RULE_VOTE_DISCRIMINATOR),
            offset: 0,
          },
        },
      ],
    }),
  ]);

  return [
    ...proposals.map(({ account, pubkey }) =>
      decodeTokenRewardAction({
        action: pubkey,
        data: account.data,
        kind: "proposal",
      }),
    ),
    ...votes.map(({ account, pubkey }) =>
      decodeTokenRewardAction({
        action: pubkey,
        data: account.data,
        kind: "supporter",
      }),
    ),
  ].sort((left, right) =>
    left.action.toBase58().localeCompare(right.action.toBase58()),
  );
}

export async function sendRewardTransaction({
  authority,
  connection,
  instructions,
  label,
}: {
  authority: Keypair;
  connection: Connection;
  instructions: TransactionInstruction[];
  label: string;
}) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([authority]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `${label} simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    DEFAULT_COMMITMENT,
  );
  if (confirmation.value.err) {
    throw new Error(
      `${label} ${signature} failed after send: ${stringifySimulationError(
        confirmation.value.err,
      )}`,
    );
  }
  return signature;
}

export async function createTokenRewardSettlementConfig(
  env = process.env,
): Promise<TokenRewardSettlementConfig> {
  const enabled = envFlag(env.IDEALER_TOKEN_REWARD_SETTLEMENT_ENABLED);
  const tokenomicsProgramId = env.TOKENOMICS_CORE_PROGRAM_ID
    ? new PublicKey(env.TOKENOMICS_CORE_PROGRAM_ID)
    : null;
  if (enabled && !tokenomicsProgramId) {
    throw new Error(
      "Token reward settlement is enabled but TOKENOMICS_CORE_PROGRAM_ID is not set.",
    );
  }
  return {
    actionAllowlist: parseTokenRewardActionAllowlist(
      env.IDEALER_TOKEN_REWARD_ACTION_ALLOWLIST,
    ),
    automation: await createTurnAutomationConfig(env),
    enabled,
    intervalMs: envNumber(
      env.IDEALER_TOKEN_REWARD_SETTLEMENT_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
    ),
    maxRewardsPerPass: envNumber(
      env.IDEALER_TOKEN_REWARD_MAX_PER_PASS,
      DEFAULT_MAX_REWARDS_PER_PASS,
    ),
    tokenomicsProgramId,
  };
}

export async function runTokenRewardSettlementOnce(
  config: TokenRewardSettlementConfig,
): Promise<TokenRewardSettlementResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes || !config.tokenomicsProgramId) {
    throw new Error(
      "Token reward settlement requires the turn-authority keypair and Tokenomics Core program ID.",
    );
  }

  const authority = Keypair.fromSecretKey(
    config.automation.authorityKeypairBytes,
  );
  const connection = new Connection(
    config.automation.rpcUrl,
    DEFAULT_COMMITMENT,
  );
  const idealerProgramId = new PublicKey(
    config.automation.programId.toString(),
  );
  const tokenomicsProgramId = config.tokenomicsProgramId;
  const globalConfig = derivePda(idealerProgramId, [
    Buffer.from("global_config"),
  ]);
  const campaign = derivePda(tokenomicsProgramId, [
    Buffer.from("campaign"),
    u64Le(0n),
  ]);
  const campaignInfo = await connection.getAccountInfo(
    campaign,
    DEFAULT_COMMITMENT,
  );
  if (!campaignInfo || !campaignInfo.owner.equals(tokenomicsProgramId)) {
    throw new Error("Initial Tokenomics campaign is missing or has wrong owner.");
  }
  const campaignAccounts = decodeCampaignAccounts({
    campaign,
    data: campaignInfo.data,
    tokenomicsProgramId,
  });

  const actions = selectTokenRewardActions({
    actions: await listRewardActions(connection, idealerProgramId),
    allowlist: config.actionAllowlist,
  });
  const unsettled: Array<{
    accounts: ActionRewardAccounts;
    action: TokenRewardAction;
  }> = [];
  for (const action of actions) {
    const rewardReceipt = deriveCampaignRewardReceipt({
      action: action.action,
      campaign,
      tokenomicsProgramId,
    });
    if (
      await connection.getAccountInfo(rewardReceipt, DEFAULT_COMMITMENT)
    ) {
      continue;
    }
    unsettled.push({
      accounts: {
        ...campaignAccounts,
        beneficiaryTokenAccount: deriveAssociatedTokenAddress({
          mint: campaignAccounts.mint,
          owner: action.beneficiary,
        }),
        globalConfig,
        rewardReceipt,
      },
      action,
    });
    if (unsettled.length >= config.maxRewardsPerPass) {
      break;
    }
  }

  if (unsettled.length === 0) {
    return { action: "nothing_to_settle" };
  }

  const rewards: Extract<
    TokenRewardSettlementResult,
    { action: "settled" }
  >["rewards"] = [];
  for (const item of unsettled) {
    const beneficiaryTokenAccountExists = Boolean(
      await connection.getAccountInfo(
        item.accounts.beneficiaryTokenAccount,
        DEFAULT_COMMITMENT,
      ),
    );
    const instructions = createActionRewardInstructions({
      accounts: item.accounts,
      action: item.action.action,
      authority: authority.publicKey,
      beneficiary: item.action.beneficiary,
      beneficiaryTokenAccountExists,
      idealerProgramId,
      kind: item.action.kind,
      tokenomicsProgramId,
    });
    const signature = await sendRewardTransaction({
      authority,
      connection,
      instructions,
      label: `${item.action.kind} token reward`,
    });
    const finalizedReceipt = await connection.getAccountInfo(
      item.accounts.rewardReceipt,
      DEFAULT_COMMITMENT,
    );
    if (
      !finalizedReceipt ||
      !finalizedReceipt.owner.equals(tokenomicsProgramId)
    ) {
      throw new Error(
        `${item.action.kind} reward finalized without its canonical receipt.`,
      );
    }
    rewards.push({
      beneficiary: item.action.beneficiary.toBase58(),
      kind: item.action.kind,
      receipt: item.accounts.rewardReceipt.toBase58(),
      signature,
    });
  }

  return { action: "settled", rewards };
}

export function startTokenRewardSettlementLoop(
  config: TokenRewardSettlementConfig,
) {
  if (!config.enabled) {
    return null;
  }
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await runTokenRewardSettlementOnce(config);
      if (result.action === "settled") {
        for (const reward of result.rewards) {
          console.log(
            `token reward kind=${reward.kind} beneficiary=${reward.beneficiary} receipt=${reward.receipt} signature=${reward.signature}`,
          );
        }
      }
    } catch (error) {
      console.error("token reward settlement failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), config.intervalMs);
}
