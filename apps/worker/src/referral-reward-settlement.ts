import { createHash } from "node:crypto";
import {
  type Commitment,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenInstruction,
  decodeCampaignAccounts,
  deriveAssociatedTokenAddress,
  sendRewardTransaction,
} from "./token-reward-settlement.js";
import {
  createTurnAutomationConfig,
  type TurnAutomationConfig,
} from "./turn-automation.js";

const COMMITMENT: Commitment = "finalized";
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const SETTLE_REFERRAL_BASE_REWARD_DISCRIMINATOR = discriminator(
  "settle_referral_base_token_rewards",
);
const SETTLE_REFERRAL_BONUS_DISCRIMINATOR = discriminator(
  "settle_referral_bonus_token_reward",
);
const REFERRAL_ATTRIBUTION_DISCRIMINATOR = accountDiscriminator(
  "ReferralAttribution",
);
const GAME_TOKEN_DISCRIMINATOR = accountDiscriminator("GameToken");

export interface ReferralRewardTarget {
  invitee: PublicKey;
  turnId: number;
}

export interface ReferralAttributionFact {
  attributedAt: bigint;
  baseRewardSettled: boolean;
  bonusSettled: boolean;
  invitee: PublicKey;
  inviter: PublicKey;
}

export interface ReferralRewardSettlementConfig {
  automation: TurnAutomationConfig;
  enabled: boolean;
  intervalMs: number;
  targets: readonly ReferralRewardTarget[];
  tokenomicsProgramId: PublicKey | null;
}

export interface ReferralRewardPlan {
  attribution: PublicKey;
  baseRewardSettled: boolean;
  bonusSettled: boolean;
  campaign: ReturnType<typeof decodeCampaignAccounts>;
  gameToken: PublicKey;
  globalConfig: PublicKey;
  invitee: PublicKey;
  inviteeTokenAccount: PublicKey;
  inviter: PublicKey;
  inviterTokenAccount: PublicKey;
  turnId: number;
}

export type ReferralRewardSettlementResult =
  | { action: "disabled" | "nothing_to_settle" }
  | {
      action: "settled";
      baseSignature: null | string;
      bonusSignature: null | string;
      invitee: string;
      turnId: number;
    };

function accountDiscriminator(name: string) {
  return createHash("sha256")
    .update(`account:${name}`)
    .digest()
    .subarray(0, 8);
}

function discriminator(name: string) {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function derivePda(programId: PublicKey, seeds: Array<Buffer | Uint8Array>) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  )[0];
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

function u64Le(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Referral turn id must be a non-negative safe integer.");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

export function parseReferralRewardTargetAllowlist(
  value: string | undefined,
): ReferralRewardTarget[] {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries || entries.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  return entries
    .map((entry) => {
      const [turnText, inviteeText, ...rest] = entry.split(":");
      const turnId = Number(turnText);
      if (
        rest.length > 0 ||
        !Number.isSafeInteger(turnId) ||
        turnId <= 0 ||
        !inviteeText
      ) {
        throw new Error(
          `Invalid referral reward target: ${entry}. Use turnId:inviteeAddress.`,
        );
      }
      let invitee: PublicKey;
      try {
        invitee = new PublicKey(inviteeText);
      } catch {
        throw new Error(
          `Invalid referral reward invitee address: ${inviteeText}.`,
        );
      }
      const key = `${turnId}:${invitee.toBase58()}`;
      if (seen.has(key)) {
        throw new Error(`Referral reward target is duplicated: ${key}.`);
      }
      seen.add(key);
      return { invitee, turnId };
    })
    .sort(
      (left, right) =>
        left.turnId - right.turnId ||
        left.invitee.toBase58().localeCompare(right.invitee.toBase58()),
    );
}

export function decodeReferralAttributionFact(
  data: Uint8Array,
): ReferralAttributionFact {
  const bytes = Buffer.from(data);
  if (
    bytes.length < 130 ||
    !bytes.subarray(0, 8).equals(REFERRAL_ATTRIBUTION_DISCRIMINATOR)
  ) {
    throw new Error("Referral attribution account is invalid.");
  }
  return {
    invitee: new PublicKey(bytes.subarray(8, 40)),
    inviter: new PublicKey(bytes.subarray(40, 72)),
    baseRewardSettled: bytes[120] === 1,
    bonusSettled: bytes[121] === 1,
    attributedAt: bytes.readBigInt64LE(122),
  };
}

function decodeGameTokenFact(data: Uint8Array) {
  const bytes = Buffer.from(data);
  if (
    bytes.length < 96 ||
    !bytes.subarray(0, 8).equals(GAME_TOKEN_DISCRIMINATOR)
  ) {
    throw new Error("Referral GameToken account is invalid.");
  }
  return {
    guessCount: bytes.readBigUInt64LE(88),
    issuedAt: bytes.readBigInt64LE(80),
    player: new PublicKey(bytes.subarray(16, 48)),
    turnId: bytes.readBigUInt64LE(8),
  };
}

function createReferralBaseRewardInstruction({
  authority,
  idealerProgramId,
  plan,
  tokenomicsProgramId,
}: {
  authority: PublicKey;
  idealerProgramId: PublicKey;
  plan: ReferralRewardPlan;
  tokenomicsProgramId: PublicKey;
}) {
  return new TransactionInstruction({
    data: Buffer.concat([SETTLE_REFERRAL_BASE_REWARD_DISCRIMINATOR, u64Le(plan.turnId)]),
    keys: [
      { isSigner: true, isWritable: true, pubkey: authority },
      { isSigner: false, isWritable: false, pubkey: plan.globalConfig },
      { isSigner: false, isWritable: false, pubkey: plan.gameToken },
      { isSigner: false, isWritable: false, pubkey: tokenomicsProgramId },
      { isSigner: false, isWritable: false, pubkey: plan.campaign.tokenConfig },
      { isSigner: false, isWritable: false, pubkey: plan.campaign.mint },
      { isSigner: false, isWritable: true, pubkey: plan.attribution },
      { isSigner: false, isWritable: true, pubkey: plan.campaign.campaign },
      { isSigner: false, isWritable: true, pubkey: plan.campaign.campaignVault },
      { isSigner: false, isWritable: true, pubkey: plan.inviterTokenAccount },
      { isSigner: false, isWritable: true, pubkey: plan.inviteeTokenAccount },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
    ],
    programId: idealerProgramId,
  });
}

function createReferralBonusInstruction({
  authority,
  idealerProgramId,
  plan,
  tokenomicsProgramId,
}: {
  authority: PublicKey;
  idealerProgramId: PublicKey;
  plan: ReferralRewardPlan;
  tokenomicsProgramId: PublicKey;
}) {
  return new TransactionInstruction({
    data: Buffer.concat([SETTLE_REFERRAL_BONUS_DISCRIMINATOR, u64Le(plan.turnId)]),
    keys: [
      { isSigner: true, isWritable: true, pubkey: authority },
      { isSigner: false, isWritable: false, pubkey: plan.globalConfig },
      { isSigner: false, isWritable: false, pubkey: tokenomicsProgramId },
      { isSigner: false, isWritable: false, pubkey: plan.campaign.tokenConfig },
      { isSigner: false, isWritable: false, pubkey: plan.campaign.mint },
      { isSigner: false, isWritable: true, pubkey: plan.attribution },
      { isSigner: false, isWritable: true, pubkey: plan.campaign.campaign },
      { isSigner: false, isWritable: true, pubkey: plan.campaign.campaignVault },
      { isSigner: false, isWritable: true, pubkey: plan.inviterTokenAccount },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
    ],
    programId: idealerProgramId,
  });
}

export async function inspectReferralRewardSettlement({
  connection,
  idealerProgramId,
  target,
  tokenomicsProgramId,
}: {
  connection: Connection;
  idealerProgramId: PublicKey;
  target: ReferralRewardTarget;
  tokenomicsProgramId: PublicKey;
}): Promise<null | ReferralRewardPlan> {
  const attribution = derivePda(tokenomicsProgramId, [
    Buffer.from("referral_attribution"),
    target.invitee.toBuffer(),
  ]);
  const attributionInfo = await connection.getAccountInfo(attribution, COMMITMENT);
  if (!attributionInfo) {
    return null;
  }
  if (!attributionInfo.owner.equals(tokenomicsProgramId)) {
    throw new Error("Referral attribution has an unexpected owner.");
  }
  const fact = decodeReferralAttributionFact(attributionInfo.data);
  if (!fact.invitee.equals(target.invitee)) {
    throw new Error("Referral attribution invitee does not match its PDA target.");
  }
  if (fact.baseRewardSettled && fact.bonusSettled) {
    return null;
  }

  const gameToken = derivePda(idealerProgramId, [
    Buffer.from("game_token"),
    u64Le(target.turnId),
    target.invitee.toBuffer(),
  ]);
  const gameTokenInfo = await connection.getAccountInfo(gameToken, COMMITMENT);
  if (!gameTokenInfo) {
    return null;
  }
  if (!gameTokenInfo.owner.equals(idealerProgramId)) {
    throw new Error("Referral GameToken has an unexpected owner.");
  }
  const gameTokenFact = decodeGameTokenFact(gameTokenInfo.data);
  if (
    gameTokenFact.turnId !== BigInt(target.turnId) ||
    !gameTokenFact.player.equals(target.invitee) ||
    gameTokenFact.guessCount === 0n ||
    fact.attributedAt > gameTokenFact.issuedAt
  ) {
    return null;
  }

  const campaign = derivePda(tokenomicsProgramId, [
    Buffer.from("campaign"),
    u64Le(0),
  ]);
  const campaignInfo = await connection.getAccountInfo(campaign, COMMITMENT);
  if (!campaignInfo || !campaignInfo.owner.equals(tokenomicsProgramId)) {
    throw new Error("Initial Tokenomics campaign is missing or has wrong owner.");
  }
  const decodedCampaign = decodeCampaignAccounts({
    campaign,
    data: campaignInfo.data,
    tokenomicsProgramId,
  });
  return {
    attribution,
    baseRewardSettled: fact.baseRewardSettled,
    bonusSettled: fact.bonusSettled,
    campaign: decodedCampaign,
    gameToken,
    globalConfig: derivePda(idealerProgramId, [Buffer.from("global_config")]),
    invitee: fact.invitee,
    inviteeTokenAccount: deriveAssociatedTokenAddress({
      mint: decodedCampaign.mint,
      owner: fact.invitee,
    }),
    inviter: fact.inviter,
    inviterTokenAccount: deriveAssociatedTokenAddress({
      mint: decodedCampaign.mint,
      owner: fact.inviter,
    }),
    turnId: target.turnId,
  };
}

async function ensureTokenAccounts({
  authority,
  connection,
  plan,
}: {
  authority: Keypair;
  connection: Connection;
  plan: ReferralRewardPlan;
}) {
  for (const [owner, tokenAccount] of [
    [plan.inviter, plan.inviterTokenAccount],
    [plan.invitee, plan.inviteeTokenAccount],
  ] as const) {
    if (await connection.getAccountInfo(tokenAccount, COMMITMENT)) {
      continue;
    }
    await sendRewardTransaction({
      authority,
      connection,
      instructions: [
        createAssociatedTokenInstruction({
          associatedToken: tokenAccount,
          mint: plan.campaign.mint,
          owner,
          payer: authority.publicKey,
        }),
      ],
      label: `create referral reward ATA ${tokenAccount.toBase58()}`,
    });
  }
}

export async function createReferralRewardSettlementConfig(
  env = process.env,
): Promise<ReferralRewardSettlementConfig> {
  const enabled = envFlag(env.IDEALER_REFERRAL_REWARD_SETTLEMENT_ENABLED);
  const tokenomicsProgramId = env.TOKENOMICS_CORE_PROGRAM_ID
    ? new PublicKey(env.TOKENOMICS_CORE_PROGRAM_ID)
    : null;
  const targets = parseReferralRewardTargetAllowlist(
    env.IDEALER_REFERRAL_REWARD_TARGET_ALLOWLIST,
  );
  if (enabled && !tokenomicsProgramId) {
    throw new Error(
      "Referral reward settlement is enabled but TOKENOMICS_CORE_PROGRAM_ID is not set.",
    );
  }
  if (enabled && targets.length === 0) {
    throw new Error(
      "Referral reward settlement requires a non-empty explicit target allowlist.",
    );
  }
  return {
    automation: await createTurnAutomationConfig(env),
    enabled,
    intervalMs: envNumber(
      env.IDEALER_REFERRAL_REWARD_SETTLEMENT_INTERVAL_MS,
      30_000,
    ),
    targets,
    tokenomicsProgramId,
  };
}

export async function runReferralRewardSettlementOnce(
  config: ReferralRewardSettlementConfig,
): Promise<ReferralRewardSettlementResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes || !config.tokenomicsProgramId) {
    throw new Error(
      "Referral reward settlement requires the turn-authority keypair and Tokenomics Core program ID.",
    );
  }
  const authority = Keypair.fromSecretKey(config.automation.authorityKeypairBytes);
  const connection = new Connection(config.automation.rpcUrl, COMMITMENT);
  const idealerProgramId = new PublicKey(config.automation.programId.toString());

  for (const target of config.targets) {
    const plan = await inspectReferralRewardSettlement({
      connection,
      idealerProgramId,
      target,
      tokenomicsProgramId: config.tokenomicsProgramId,
    });
    if (!plan) {
      continue;
    }
    await ensureTokenAccounts({ authority, connection, plan });
    let baseSignature: null | string = null;
    if (!plan.baseRewardSettled) {
      baseSignature = await sendRewardTransaction({
        authority,
        connection,
        instructions: [
          createReferralBaseRewardInstruction({
            authority: authority.publicKey,
            idealerProgramId,
            plan,
            tokenomicsProgramId: config.tokenomicsProgramId,
          }),
        ],
        label: `referral base reward turn ${plan.turnId}`,
      });
    }
    if (plan.bonusSettled) {
      return {
        action: "settled",
        baseSignature,
        bonusSignature: null,
        invitee: plan.invitee.toBase58(),
        turnId: plan.turnId,
      };
    }
    const bonusSignature = await sendRewardTransaction({
      authority,
      connection,
      instructions: [
        createReferralBonusInstruction({
          authority: authority.publicKey,
          idealerProgramId,
          plan,
          tokenomicsProgramId: config.tokenomicsProgramId,
        }),
      ],
      label: `referral bonus turn ${plan.turnId}`,
    });
    return {
      action: "settled",
      baseSignature,
      bonusSignature,
      invitee: plan.invitee.toBase58(),
      turnId: plan.turnId,
    };
  }
  return { action: "nothing_to_settle" };
}

export function startReferralRewardSettlementLoop(
  config: ReferralRewardSettlementConfig,
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
      const result = await runReferralRewardSettlementOnce(config);
      if (result.action === "settled") {
        console.log(
          `referral reward turn=${result.turnId} invitee=${result.invitee} base=${result.baseSignature ?? "already_settled"} bonus=${result.bonusSignature ?? "already_settled"}`,
        );
      }
    } catch (error) {
      console.error("referral reward settlement failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), config.intervalMs);
}
