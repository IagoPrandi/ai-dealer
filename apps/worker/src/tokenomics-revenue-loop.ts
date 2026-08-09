import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMerkleTree,
  createMerkleProof,
  hashCanonicalLeafFile,
  hashEpochManifest,
  type TreasuryDistributionLeaf,
} from "@tyche/tokenomics";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";

import { persistFinalizedTransaction } from "./durable-indexer.js";
import {
  requireIndependentEpochAgreement,
  runRustEpochCalculator,
  type EpochCalculatorInput,
  type EpochCalculatorOutput,
} from "./tokenomics-epoch.js";
import {
  createTurnAutomationConfig,
  loadAuthorityKeypairBytesFromEnv,
  type TurnAutomationConfig,
} from "./turn-automation.js";

const FINALIZED: Commitment = "finalized";
const EPOCH_TURN_COUNT = 7;
const DEFAULT_INTERVAL_MS = 30_000;
const MAX_SIGNATURE_PAGES = 20;
const MAX_ARTIFACT_URI_BYTES = 200;
const MAX_PROJECTION_EPOCHS = 10_000;
const LOCK_POSITION_SIZE = 194;
const TURN_STATE_SIZE = 789;
const TOKEN_CONFIG_DISCRIMINATOR = discriminator("account:TokenConfig");
const DISTRIBUTION_EPOCH_DISCRIMINATOR = discriminator(
  "account:DistributionEpoch",
);
const LOCK_POSITION_DISCRIMINATOR = discriminator("account:LockPosition");
const LOCK_CHANGED_DISCRIMINATOR = discriminator("event:LockChanged");
const EPOCH_OPENED_DISCRIMINATOR = discriminator("event:EpochOpened");
const EPOCH_COLLECTION_CLOSED_DISCRIMINATOR = discriminator(
  "event:EpochCollectionClosed",
);
const CAMPAIGN_RESERVE_DISCRIMINATOR = discriminator("account:CampaignReserve");
const CAMPAIGN_REWARD_RECEIPT_DISCRIMINATOR = discriminator(
  "account:CampaignRewardReceipt",
);
const DISTRIBUTION_CLAIM_DISCRIMINATOR = discriminator(
  "account:TreasuryDistributionClaim",
);
const BRIDGE_TURN_TREASURY_FEE_DISCRIMINATOR = discriminator(
  "global:bridge_turn_treasury_fee",
);
const CLOSE_TOKENOMICS_EPOCH_COLLECTION_DISCRIMINATOR = discriminator(
  "global:close_tokenomics_epoch_collection",
);
const OPEN_DISTRIBUTION_EPOCH_DISCRIMINATOR = discriminator(
  "global:open_distribution_epoch",
);
const PUBLISH_PROVISIONAL_ROOT_DISCRIMINATOR = discriminator(
  "global:publish_provisional_root",
);
const SEAL_EPOCH_ROOT_DISCRIMINATOR = discriminator("global:seal_epoch_root");

export interface TokenomicsRevenueConfig {
  apiBaseUrl: string;
  artifactBaseUrl: string | null;
  automation: TurnAutomationConfig;
  calculationCodeCommit: string | null;
  enabled: boolean;
  firstEpochTurnId: number;
  intervalMs: number;
  projectionToken: string | null;
  publisherKeypairBytes: Uint8Array | null;
  tokenomicsProgramId: PublicKey;
}

export interface TokenConfigSnapshot {
  creatorTreasuryReserveVault: PublicKey;
  correctionReserveVault: PublicKey;
  distributionVault: PublicKey;
  epochRootPublisher: PublicKey;
  gameAuthority: PublicKey;
  initialCampaignVault: PublicKey;
  mint: PublicKey;
  network: string;
  nextEpochId: bigint;
  paused: boolean;
  pendingRolloverLamports: bigint;
  treasuryLockEscrow: PublicKey;
  treasurySolVault: PublicKey;
}

export type EpochStatus =
  | "calculating"
  | "cancelled"
  | "challenged"
  | "collecting"
  | "expired_unresolved"
  | "provisional"
  | "rolled_over_no_weight"
  | "sealed";

export interface DistributionEpochSnapshot {
  artifactUri: string;
  epochId: bigint;
  finalisedFeesLamports: bigint;
  firstTurnId: bigint;
  grossDistributableLamports: bigint;
  lastTurnId: bigint;
  manifestHash: string | null;
  merkleRoot: string | null;
  remainingClaimLiabilityLamports: bigint;
  rolloverInLamports: bigint;
  rolloverOutLamports: bigint;
  rootVersion: number;
  status: EpochStatus;
  sumOfMerkleClaimsLamports: bigint;
  totalWeight: bigint;
  unresolvedChallenges: number;
  verificationWindowEndsAt: bigint;
}

interface LockPositionSnapshot {
  beneficiary: PublicKey;
  beneficialOwner: PublicKey;
  lockedAtoms: bigint;
  position: PublicKey;
  returnTokenAccount: PublicKey;
}

interface LockChangedEvent {
  amountAtoms: bigint;
  lockedAtoms: bigint;
  logIndex: number;
  position: PublicKey;
  signature: string;
  slot: number;
  timestamp: bigint;
  type: "lock" | "unlock";
}

export type TokenomicsRevenueResult =
  | { action: "disabled" | "paused" }
  | {
      action: "awaiting_publisher";
      epochId: string;
      operation: "open" | "publish";
    }
  | { action: "awaiting_turn"; epochId: string; turnId: number }
  | { action: "awaiting_review" | "challenged"; epochId: string }
  | {
      action:
        | "opened_epoch"
        | "closed_collection"
        | "published_root"
        | "sealed_epoch";
      epochId: string;
      signature: string;
    }
  | {
      action: "bridged_turn";
      amountLamports: string;
      epochId: string;
      signature: string;
      turnId: number;
    };

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function createTokenomicsRevenueConfig(
  env = process.env,
): Promise<TokenomicsRevenueConfig> {
  const automation = await createTurnAutomationConfig(env);
  const tokenomicsProgram = env.TOKENOMICS_CORE_PROGRAM_ID;
  if (!tokenomicsProgram) {
    throw new Error(
      "TOKENOMICS_CORE_PROGRAM_ID is required for revenue epochs.",
    );
  }
  const artifactBaseUrl = env.TYCHE_TOKENOMICS_ARTIFACT_BASE_URL ?? null;
  if (artifactBaseUrl && !/^https:\/\//u.test(artifactBaseUrl)) {
    throw new Error("TYCHE_TOKENOMICS_ARTIFACT_BASE_URL must use HTTPS.");
  }
  const calculationCodeCommit =
    env.TYCHE_TOKENOMICS_CALCULATION_CODE_COMMIT ?? null;
  if (
    calculationCodeCommit &&
    !/^[0-9a-f]{64}$/iu.test(calculationCodeCommit)
  ) {
    throw new Error(
      "TYCHE_TOKENOMICS_CALCULATION_CODE_COMMIT must be 32-byte hex.",
    );
  }
  const publisherKeypairBytes = await loadAuthorityKeypairBytesFromEnv({
    ...env,
    TYCHE_TURN_AUTHORITY_KEYPAIR: env.TYCHE_TOKENOMICS_EPOCH_PUBLISHER_KEYPAIR,
    TYCHE_TURN_AUTHORITY_KEYPAIR_PATH:
      env.TYCHE_TOKENOMICS_EPOCH_PUBLISHER_KEYPAIR_PATH,
  });
  const enabled = envFlag(env.TYCHE_TOKENOMICS_REVENUE_AUTOMATION_ENABLED);
  const firstEpochTurnId = env.TYCHE_TOKENOMICS_FIRST_EPOCH_TURN_ID
    ? positiveInteger(env.TYCHE_TOKENOMICS_FIRST_EPOCH_TURN_ID, 0)
    : 0;
  if (enabled && firstEpochTurnId === 0) {
    throw new Error(
      "TYCHE_TOKENOMICS_FIRST_EPOCH_TURN_ID is required when revenue automation is enabled.",
    );
  }
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? "http://localhost:3002",
    artifactBaseUrl,
    automation,
    calculationCodeCommit,
    enabled,
    firstEpochTurnId,
    intervalMs: positiveInteger(
      env.TYCHE_TOKENOMICS_REVENUE_AUTOMATION_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
    ),
    projectionToken: env.TOKENOMICS_PROJECTION_TOKEN ?? null,
    publisherKeypairBytes,
    tokenomicsProgramId: new PublicKey(tokenomicsProgram),
  };
}

export function decodeTokenConfig(data: Buffer): TokenConfigSnapshot {
  assertDiscriminator(data, TOKEN_CONFIG_DISCRIMINATOR, "TokenConfig");
  const cursor = new Cursor(data, 8);
  cursor.publicKey(); // governance
  cursor.publicKey(); // guardian
  const gameAuthority = cursor.publicKey();
  const epochRootPublisher = cursor.publicKey();
  const mint = cursor.publicKey();
  cursor.publicKey(); // metadata
  cursor.publicKey(); // metadata update authority
  cursor.string();
  cursor.bool();
  const creatorTreasuryReserveVault = cursor.publicKey();
  const treasuryLockEscrow = cursor.publicKey();
  const initialCampaignVault = cursor.publicKey();
  const distributionVault = cursor.publicKey();
  const treasurySolVault = cursor.publicKey();
  const correctionReserveVault = cursor.publicKey();
  const network = cursor.string();
  const nextEpochId = cursor.u64();
  cursor.u64(); // next correction epoch
  const pendingRolloverLamports = cursor.u64();
  cursor.u64(); // sealed liability
  cursor.u64(); // correction liability
  const paused = cursor.bool();
  return {
    creatorTreasuryReserveVault,
    correctionReserveVault,
    distributionVault,
    epochRootPublisher,
    gameAuthority,
    initialCampaignVault,
    mint,
    network,
    nextEpochId,
    paused,
    pendingRolloverLamports,
    treasuryLockEscrow,
    treasurySolVault,
  };
}

export function decodeDistributionEpoch(
  data: Buffer,
): DistributionEpochSnapshot {
  assertDiscriminator(
    data,
    DISTRIBUTION_EPOCH_DISCRIMINATOR,
    "DistributionEpoch",
  );
  const cursor = new Cursor(data, 8);
  const epochId = cursor.u64();
  const kind = cursor.u8();
  if (kind !== 0) {
    throw new Error("Revenue automation accepts only standard epochs.");
  }
  cursor.u64(); // original epoch
  const firstTurnId = cursor.u64();
  const lastTurnId = cursor.u64();
  const finalisedFeesLamports = cursor.u64();
  const rolloverInLamports = cursor.u64();
  const grossDistributableLamports = cursor.u64();
  const totalWeight = cursor.u128();
  const sumOfMerkleClaimsLamports = cursor.u64();
  const remainingClaimLiabilityLamports = cursor.u64();
  cursor.u64(); // rounding dust
  cursor.u64(); // zero-weight rollover
  const rolloverOutLamports = cursor.u64();
  const merkleRoot = nullableHash(cursor.hash32());
  const manifestHash = nullableHash(cursor.hash32());
  cursor.hash32(); // leaf file hash
  cursor.hash32(); // calculation commit
  cursor.hash32(); // incident hash
  cursor.hash32(); // correction reason
  const artifactUri = cursor.string();
  const rootVersion = cursor.u32();
  cursor.i64(); // provisional published at
  const verificationWindowEndsAt = cursor.i64();
  cursor.i64(); // challenge deadline
  const unresolvedChallenges = cursor.u32();
  const status = decodeEpochStatus(cursor.u8());
  return {
    artifactUri,
    epochId,
    finalisedFeesLamports,
    firstTurnId,
    grossDistributableLamports,
    lastTurnId,
    manifestHash,
    merkleRoot,
    remainingClaimLiabilityLamports,
    rolloverInLamports,
    rolloverOutLamports,
    rootVersion,
    status,
    sumOfMerkleClaimsLamports,
    totalWeight,
    unresolvedChallenges,
    verificationWindowEndsAt,
  };
}

export async function runTokenomicsRevenueOnce(
  config: TokenomicsRevenueConfig,
): Promise<TokenomicsRevenueResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes) {
    throw new Error(
      "Revenue automation requires the Tyche turn authority keypair.",
    );
  }
  const connection = new Connection(config.automation.rpcUrl, FINALIZED);
  const tokenConfigAddress = pda(config.tokenomicsProgramId, ["token_config"]);
  const tokenConfigAccount = await connection.getAccountInfo(
    tokenConfigAddress,
    FINALIZED,
  );
  if (!tokenConfigAccount?.owner.equals(config.tokenomicsProgramId)) {
    throw new Error(
      "Canonical TokenConfig account is missing or has the wrong owner.",
    );
  }
  const tokenConfig = decodeTokenConfig(tokenConfigAccount.data);
  if (tokenConfig.paused) {
    return { action: "paused" };
  }
  const globalConfig = pda(
    new PublicKey(config.automation.programId.toString()),
    ["global_config"],
  );
  if (!tokenConfig.gameAuthority.equals(globalConfig)) {
    throw new Error(
      "TokenConfig game authority is not the canonical Tyche GlobalConfig PDA.",
    );
  }

  const epochId = tokenConfig.nextEpochId;
  const epochAddress = pda(config.tokenomicsProgramId, ["epoch", u64(epochId)]);
  let epochAccount = await connection.getAccountInfo(epochAddress, FINALIZED);
  if (!epochAccount) {
    await publishOnChainProjection({
      config,
      connection,
      epoch: null,
      tokenConfig,
    });
    const publisher = requirePublisher(config, tokenConfig);
    if (!publisher) {
      return {
        action: "awaiting_publisher",
        epochId: epochId.toString(),
        operation: "open",
      };
    }
    const firstTurnId =
      BigInt(config.firstEpochTurnId) + epochId * BigInt(EPOCH_TURN_COUNT);
    const instruction = new TransactionInstruction({
      data: Buffer.concat([
        OPEN_DISTRIBUTION_EPOCH_DISCRIMINATOR,
        u64(epochId),
        u64(firstTurnId),
      ]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: publisher.publicKey },
        { isSigner: false, isWritable: true, pubkey: tokenConfigAddress },
        { isSigner: false, isWritable: true, pubkey: epochAddress },
        { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
      ],
      programId: config.tokenomicsProgramId,
    });
    const signature = await simulateSendAndIndex({
      config,
      connection,
      eventKind: "tokenomics.epoch_opened",
      instruction,
      payer: publisher,
      payload: {
        epochId: epochId.toString(),
        firstTurnId: firstTurnId.toString(),
      },
    });
    return { action: "opened_epoch", epochId: epochId.toString(), signature };
  }
  if (!epochAccount.owner.equals(config.tokenomicsProgramId)) {
    throw new Error("DistributionEpoch account has the wrong owner.");
  }
  const epoch = decodeDistributionEpoch(epochAccount.data);
  await publishOnChainProjection({ config, connection, epoch, tokenConfig });

  if (epoch.status === "collecting") {
    for (
      let turnId = Number(epoch.firstTurnId);
      turnId <= Number(epoch.lastTurnId);
      turnId += 1
    ) {
      const turnAddress = pda(
        new PublicKey(config.automation.programId.toString()),
        ["turn", u64(BigInt(turnId))],
      );
      const turn = await connection.getAccountInfo(turnAddress, FINALIZED);
      if (
        !turn ||
        turn.data.length !== TURN_STATE_SIZE ||
        turn.data[32] === 0
      ) {
        return { action: "awaiting_turn", epochId: epochId.toString(), turnId };
      }
      const amountLamports = turn.data.readBigUInt64LE(41);
      if (turn.data[49] === 0) {
        const authority = Keypair.fromSecretKey(
          config.automation.authorityKeypairBytes,
        );
        const instruction = bridgeInstruction({
          authority: authority.publicKey,
          config,
          distributionVault: tokenConfig.distributionVault,
          epoch: epochAddress,
          tokenConfig: tokenConfigAddress,
          turn: turnAddress,
          turnId,
        });
        const signature = await simulateSendAndIndex({
          config,
          connection,
          eventKind: "tokenomics.turn_treasury_fee_bridged",
          instruction,
          payer: authority,
          payload: {
            amountLamports: amountLamports.toString(),
            epochId: epochId.toString(),
            turnId,
          },
        });
        return {
          action: "bridged_turn",
          amountLamports: amountLamports.toString(),
          epochId: epochId.toString(),
          signature,
          turnId,
        };
      }
    }
    const authority = Keypair.fromSecretKey(
      config.automation.authorityKeypairBytes,
    );
    const instruction = closeCollectionInstruction({
      authority: authority.publicKey,
      config,
      epoch: epochAddress,
      tokenConfig: tokenConfigAddress,
      lastTurnId: epoch.lastTurnId,
    });
    const signature = await simulateSendAndIndex({
      config,
      connection,
      eventKind: "tokenomics.epoch_collection_closed",
      instruction,
      payer: authority,
      payload: {
        epochId: epochId.toString(),
        lastTurnId: epoch.lastTurnId.toString(),
      },
    });
    return {
      action: "closed_collection",
      epochId: epochId.toString(),
      signature,
    };
  }

  if (
    epoch.status === "calculating" ||
    epoch.status === "cancelled" ||
    epoch.status === "expired_unresolved"
  ) {
    const publisher = requirePublisher(config, tokenConfig);
    if (!publisher) {
      return {
        action: "awaiting_publisher",
        epochId: epochId.toString(),
        operation: "publish",
      };
    }
    const artifact = await calculateAndStoreArtifact({
      config,
      connection,
      epoch,
      tokenConfig,
    });
    const instruction = publishRootInstruction({
      artifact,
      config,
      correctionReserveVault: tokenConfig.correctionReserveVault,
      distributionVault: tokenConfig.distributionVault,
      epoch: epochAddress,
      publisher: publisher.publicKey,
      rootVersion: epoch.rootVersion + 1,
      tokenConfig: tokenConfigAddress,
    });
    const signature = await simulateSendAndIndex({
      config,
      connection,
      eventKind: "tokenomics.provisional_root_published",
      instruction,
      payer: publisher,
      payload: {
        epochId: epochId.toString(),
        manifestHash: artifact.manifestHash,
      },
    });
    return { action: "published_root", epochId: epochId.toString(), signature };
  }

  if (epoch.status === "challenged") {
    return { action: "challenged", epochId: epochId.toString() };
  }
  if (epoch.status === "provisional") {
    if (
      epoch.unresolvedChallenges > 0 ||
      BigInt(Math.floor(Date.now() / 1_000)) < epoch.verificationWindowEndsAt
    ) {
      return { action: "awaiting_review", epochId: epochId.toString() };
    }
    const authority = Keypair.fromSecretKey(
      config.automation.authorityKeypairBytes,
    );
    const instruction = new TransactionInstruction({
      data: SEAL_EPOCH_ROOT_DISCRIMINATOR,
      keys: [
        { isSigner: false, isWritable: true, pubkey: tokenConfigAddress },
        { isSigner: false, isWritable: true, pubkey: epochAddress },
        {
          isSigner: false,
          isWritable: false,
          pubkey: tokenConfig.distributionVault,
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: tokenConfig.correctionReserveVault,
        },
      ],
      programId: config.tokenomicsProgramId,
    });
    const signature = await simulateSendAndIndex({
      config,
      connection,
      eventKind: "tokenomics.epoch_sealed",
      instruction,
      payer: authority,
      payload: { epochId: epochId.toString(), rootVersion: epoch.rootVersion },
    });
    return { action: "sealed_epoch", epochId: epochId.toString(), signature };
  }

  // Sealed and zero-weight epochs increment next_epoch_id on-chain. A fresh
  // TokenConfig read on the next pass opens the next canonical range.
  epochAccount = await connection.getAccountInfo(epochAddress, FINALIZED);
  if (!epochAccount) {
    throw new Error("Epoch disappeared after it was decoded.");
  }
  return { action: "awaiting_review", epochId: epochId.toString() };
}

export function startTokenomicsRevenueLoop(config: TokenomicsRevenueConfig) {
  if (!config.enabled) {
    return null;
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runTokenomicsRevenueOnce(config);
      if (
        result.action !== "awaiting_review" &&
        result.action !== "awaiting_turn"
      ) {
        console.log(`tokenomics revenue action=${result.action}`);
      }
    } catch (error) {
      console.error("tokenomics revenue automation failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), config.intervalMs);
}

interface CalculatedArtifact {
  claims: Array<{
    amountLamports: string;
    beneficiary: string;
    leafHash: string;
    position: string;
    proof: string[];
  }>;
  leafFileHash: string;
  manifest: Record<string, string>;
  manifestHash: string;
  merkleRoot: string | null;
  output: EpochCalculatorOutput;
  uri: string;
}

async function publishOnChainProjection({
  config,
  connection,
  epoch,
  tokenConfig,
}: {
  config: TokenomicsRevenueConfig;
  connection: Connection;
  epoch: DistributionEpochSnapshot | null;
  tokenConfig: TokenConfigSnapshot;
}) {
  if (!config.projectionToken) {
    throw new Error(
      "TOKENOMICS_PROJECTION_TOKEN is required while revenue automation is enabled.",
    );
  }
  const positions = await fetchLockPositions(
    connection,
    config.tokenomicsProgramId,
  );
  const lockedSupplyAtoms = positions.reduce(
    (sum, position) => sum + position.lockedAtoms,
    0n,
  );
  const history = epoch
    ? await fetchLockHistory(connection, config.tokenomicsProgramId)
    : null;
  let weights = new Map<string, bigint>();
  if (epoch && history) {
    const firstTurn = await fetchOptionalTurnBoundary(
      connection,
      config,
      Number(epoch.firstTurnId),
    );
    if (firstTurn) {
      const lastTurn = await fetchOptionalTurnBoundary(
        connection,
        config,
        Number(epoch.lastTurnId),
      );
      const endsAt =
        epoch.status === "collecting"
          ? BigInt(
              Math.min(
                Math.floor(Date.now() / 1_000),
                lastTurn?.endTimestamp ?? Number.MAX_SAFE_INTEGER,
              ),
            )
          : BigInt(lastTurn?.endTimestamp ?? Math.floor(Date.now() / 1_000));
      weights = new Map(
        calculatePositionWeights(
          history.events,
          positions,
          BigInt(firstTurn.startTimestamp),
          endsAt,
        ).map((position) => [position.position.toBase58(), position.weight]),
      );
    }
  }

  const campaignAddress = pda(config.tokenomicsProgramId, [
    "campaign",
    u64(0n),
  ]);
  const [
    campaignAccount,
    mintAccount,
    distributionAccount,
    treasurySolAccount,
    correctionAccount,
  ] = await Promise.all([
    connection.getAccountInfo(campaignAddress, FINALIZED),
    connection.getAccountInfo(tokenConfig.mint, FINALIZED),
    connection.getAccountInfo(tokenConfig.distributionVault, FINALIZED),
    connection.getAccountInfo(tokenConfig.treasurySolVault, FINALIZED),
    connection.getAccountInfo(tokenConfig.correctionReserveVault, FINALIZED),
  ]);
  if (
    !campaignAccount ||
    !mintAccount ||
    !distributionAccount ||
    !treasurySolAccount ||
    !correctionAccount
  ) {
    throw new Error("Tokenomics projection is missing a canonical account.");
  }
  assertDiscriminator(
    campaignAccount.data,
    CAMPAIGN_RESERVE_DISCRIMINATOR,
    "CampaignReserve",
  );
  if (mintAccount.data.length < 82) {
    throw new Error("JDR mint account is truncated.");
  }
  const campaignId = campaignAccount.data.readBigUInt64LE(8);
  const campaignVault = new PublicKey(campaignAccount.data.subarray(48, 80));
  const originalCampaignAtoms = campaignAccount.data.readBigUInt64LE(80);
  const cumulativeCampaignAtoms = campaignAccount.data.readBigUInt64LE(88);
  const remainingCampaignAtoms = campaignAccount.data.readBigUInt64LE(96);
  const campaignState = decodeCampaignState(campaignAccount.data[104] ?? 255);
  const fixedSupplyAtoms = mintAccount.data.readBigUInt64LE(36);
  const creatorTreasuryAtoms = fixedSupplyAtoms - originalCampaignAtoms;
  const rentByLength = new Map<number, number>();
  const availableLamports = async (account: {
    data: Buffer;
    lamports: number;
  }) => {
    let rent = rentByLength.get(account.data.length);
    if (rent === undefined) {
      rent = await connection.getMinimumBalanceForRentExemption(
        account.data.length,
        FINALIZED,
      );
      rentByLength.set(account.data.length, rent);
    }
    return BigInt(Math.max(account.lamports - rent, 0));
  };
  const [
    distributionAvailable,
    treasurySolLamports,
    correctionReserveLamports,
  ] = await Promise.all([
    availableLamports(distributionAccount),
    availableLamports(treasurySolAccount),
    availableLamports(correctionAccount),
  ]);
  const [promotionalRewards, claimedPositions] = await Promise.all([
    fetchPromotionalRewardAtoms(connection, config.tokenomicsProgramId),
    fetchClaimedPositions(connection, config.tokenomicsProgramId),
  ]);
  const projectionEpochs = await fetchProjectionEpochs(
    connection,
    config.tokenomicsProgramId,
    tokenConfig.nextEpochId,
  );
  const epochArtifacts = await Promise.all(
    projectionEpochs.map(async (projectionEpoch) => ({
      artifact:
        projectionEpoch.manifestHash && projectionEpoch.artifactUri
          ? await fetchEpochArtifact(
              config.apiBaseUrl,
              projectionEpoch.manifestHash,
            )
          : null,
      epoch: projectionEpoch,
    })),
  );
  const positionByHex = new Map(
    positions.map((position) => [
      position.position.toBuffer().toString("hex"),
      position,
    ]),
  );
  const claimRecordsByOwner = new Map<
    string,
    Array<{
      amountLamports: string;
      beneficiary: string;
      epochId: string;
      epochKind: "standard";
      position: string;
      proof: string[];
      rootVersion: number;
      signature: string;
      status: "claimable" | "claimed";
    }>
  >();
  for (const { artifact, epoch: projectionEpoch } of epochArtifacts) {
    if (!artifact) continue;
    for (const claim of artifact.claims) {
      const position = positionByHex.get(claim.position);
      if (!position) {
        throw new Error("Epoch artifact references an unknown lock position.");
      }
      const owner = position.beneficialOwner.toBase58();
      const claimed = claimedPositions.has(
        `${projectionEpoch.epochId}:${position.position.toBase58()}`,
      );
      const status: "claimable" | "claimed" = claimed ? "claimed" : "claimable";
      if (projectionEpoch.status !== "sealed" && !claimed) {
        continue;
      }
      const record = {
        amountLamports: claim.amountLamports,
        beneficiary: new PublicKey(
          Buffer.from(claim.beneficiary, "hex"),
        ).toBase58(),
        epochId: projectionEpoch.epochId.toString(),
        epochKind: "standard" as const,
        position: position.position.toBase58(),
        proof: claim.proof,
        rootVersion: projectionEpoch.rootVersion,
        signature: "",
        status,
      };
      claimRecordsByOwner.set(owner, [
        ...(claimRecordsByOwner.get(owner) ?? []),
        record,
      ]);
    }
  }

  const decodedReturnAddresses = positions.map(
    (position) => position.returnTokenAccount,
  );
  const unlockedAccounts = await connection.getMultipleAccountsInfo(
    decodedReturnAddresses,
    FINALIZED,
  );
  const wallets = positions.map((position, index) => {
    const owner = position.beneficialOwner.toBase58();
    const records = claimRecordsByOwner.get(owner) ?? [];
    const unlockedAccount = unlockedAccounts[index];
    const unlockedAtoms =
      unlockedAccount && unlockedAccount.data.length >= 72
        ? unlockedAccount.data.readBigUInt64LE(64)
        : 0n;
    const claimableLamports = records
      .filter((record) => record.status === "claimable")
      .reduce((sum, record) => sum + BigInt(record.amountLamports), 0n);
    const claimedLamports = records
      .filter((record) => record.status === "claimed")
      .reduce((sum, record) => sum + BigInt(record.amountLamports), 0n);
    return {
      claimableLamports: claimableLamports.toString(),
      claimedLamports: claimedLamports.toString(),
      claimRecords: records,
      currentEpochWeight: (
        weights.get(position.position.toBase58()) ?? 0n
      ).toString(),
      lockedAtoms: position.lockedAtoms.toString(),
      promotionalRewardAtoms: (promotionalRewards.get(owner) ?? 0n).toString(),
      unlockedTokenAccount: decodedReturnAddresses[index]?.toBase58() ?? "",
      unlockedAtoms: unlockedAtoms.toString(),
      wallet: owner,
    };
  });
  const maxLockedAtoms = positions.reduce(
    (maximum, position) =>
      position.lockedAtoms > maximum ? position.lockedAtoms : maximum,
    0n,
  );
  const finalizedSlot = await connection.getSlot(FINALIZED);
  const collectingGross = epoch
    ? epoch.finalisedFeesLamports + epoch.rolloverInLamports
    : 0n;
  const projection = {
    allocation: {
      campaignReserveAtoms: originalCampaignAtoms.toString(),
      creatorTreasuryAtoms: creatorTreasuryAtoms.toString(),
      fixedSupplyAtoms: fixedSupplyAtoms.toString(),
      freezeAuthorityRevoked: mintAccount.data.readUInt32LE(46) === 0,
      mintAuthorityRevoked: mintAccount.data.readUInt32LE(0) === 0,
    },
    campaigns: [
      {
        campaignId: campaignId.toString(),
        cumulativeDistributedAtoms: cumulativeCampaignAtoms.toString(),
        originalAllocationAtoms: originalCampaignAtoms.toString(),
        remainingAtoms: remainingCampaignAtoms.toString(),
        state: campaignState,
        vault: campaignVault.toBase58(),
      },
    ],
    cluster: tokenConfig.network,
    currentEpoch: epoch
      ? {
          epochId: epoch.epochId.toString(),
          grossDistributableLamports:
            epoch.status === "collecting"
              ? collectingGross.toString()
              : epoch.grossDistributableLamports.toString(),
          manifestHash: epoch.manifestHash,
          merkleRoot: epoch.merkleRoot,
          remainingClaimLiabilityLamports:
            epoch.remainingClaimLiabilityLamports.toString(),
          rolloverOutLamports: epoch.rolloverOutLamports.toString(),
          rootVersion: epoch.rootVersion,
          status: epoch.status,
          sumOfMerkleClaimsLamports: epoch.sumOfMerkleClaimsLamports.toString(),
          totalWeight:
            epoch.status === "collecting"
              ? [...weights.values()]
                  .reduce((sum, weight) => sum + weight, 0n)
                  .toString()
              : epoch.totalWeight.toString(),
          verificationWindowEndsAt:
            epoch.verificationWindowEndsAt > 0n
              ? new Date(
                  Number(epoch.verificationWindowEndsAt) * 1_000,
                ).toISOString()
              : null,
        }
      : null,
    indexedAt: new Date().toISOString(),
    indexedFinalizedSlot: finalizedSlot.toString(),
    lockConcentrationBps:
      lockedSupplyAtoms === 0n
        ? 0
        : Number((maxLockedAtoms * 10_000n) / lockedSupplyAtoms),
    lockedSupplyAtoms: lockedSupplyAtoms.toString(),
    mint: tokenConfig.mint.toBase58(),
    programId: config.tokenomicsProgramId.toBase58(),
    uniqueLockers: positions.filter((position) => position.lockedAtoms > 0n)
      .length,
    vaults: {
      correctionReserve: tokenConfig.correctionReserveVault.toBase58(),
      correctionReserveLamports: correctionReserveLamports.toString(),
      distribution: tokenConfig.distributionVault.toBase58(),
      distributionAvailableLamports: distributionAvailable.toString(),
      initialCampaign: tokenConfig.initialCampaignVault.toBase58(),
      treasuryLockEscrow: tokenConfig.treasuryLockEscrow.toBase58(),
      treasuryReserve: tokenConfig.creatorTreasuryReserveVault.toBase58(),
      treasurySol: tokenConfig.treasurySolVault.toBase58(),
      treasurySolLamports: treasurySolLamports.toString(),
    },
    wallets,
  };
  const response = await fetch(
    new URL("/tokenomics/projection", config.apiBaseUrl),
    {
      body: JSON.stringify(projection),
      headers: {
        authorization: `Bearer ${config.projectionToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Tokenomics projection persistence failed with HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }
}

async function fetchEpochArtifact(apiBaseUrl: string, manifestHash: string) {
  const response = await fetch(
    new URL(`/tokenomics/artifacts/${manifestHash}`, apiBaseUrl),
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Tokenomics artifact read failed with HTTP ${response.status}.`,
    );
  }
  const body = (await response.json()) as {
    artifact?: CalculatedArtifact;
  };
  if (!body.artifact) {
    throw new Error("Tokenomics artifact response is malformed.");
  }
  return body.artifact;
}

async function fetchProjectionEpochs(
  connection: Connection,
  programId: PublicKey,
  nextEpochId: bigint,
) {
  if (nextEpochId > BigInt(MAX_PROJECTION_EPOCHS)) {
    throw new Error(
      `Tokenomics projection exceeded the ${MAX_PROJECTION_EPOCHS}-epoch safety bound.`,
    );
  }
  const epochCount = Number(nextEpochId) + 1;
  const addresses = Array.from({ length: epochCount }, (_, epochId) =>
    pda(programId, ["epoch", u64(BigInt(epochId))]),
  );
  const epochs: DistributionEpochSnapshot[] = [];
  for (let offset = 0; offset < addresses.length; offset += 100) {
    const batch = addresses.slice(offset, offset + 100);
    const accounts = await connection.getMultipleAccountsInfo(batch, FINALIZED);
    accounts.forEach((account, index) => {
      if (!account) return;
      if (!account.owner.equals(programId)) {
        throw new Error("Historical DistributionEpoch has the wrong owner.");
      }
      const decoded = decodeDistributionEpoch(account.data);
      const expectedEpochId = BigInt(offset + index);
      if (decoded.epochId !== expectedEpochId) {
        throw new Error(
          "Historical DistributionEpoch PDA does not match its epoch id.",
        );
      }
      epochs.push(decoded);
    });
  }
  return epochs;
}

async function fetchPromotionalRewardAtoms(
  connection: Connection,
  programId: PublicKey,
) {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: FINALIZED,
    filters: [
      { dataSize: 131 },
      {
        memcmp: {
          bytes: CAMPAIGN_REWARD_RECEIPT_DISCRIMINATOR.toString("base64"),
          encoding: "base64",
          offset: 0,
        },
      },
    ],
  });
  const rewards = new Map<string, bigint>();
  for (const { account } of accounts) {
    const beneficiary = new PublicKey(
      account.data.subarray(72, 104),
    ).toBase58();
    rewards.set(
      beneficiary,
      (rewards.get(beneficiary) ?? 0n) + account.data.readBigUInt64LE(113),
    );
  }
  return rewards;
}

async function fetchClaimedPositions(
  connection: Connection,
  programId: PublicKey,
) {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: FINALIZED,
    filters: [
      { dataSize: 165 },
      {
        memcmp: {
          bytes: DISTRIBUTION_CLAIM_DISCRIMINATOR.toString("base64"),
          encoding: "base64",
          offset: 0,
        },
      },
    ],
  });
  return new Set(
    accounts.map(({ account }) => {
      const epochId = account.data.readBigUInt64LE(40);
      const position = new PublicKey(account.data.subarray(84, 116));
      return `${epochId}:${position.toBase58()}`;
    }),
  );
}

async function calculateAndStoreArtifact({
  config,
  connection,
  epoch,
  tokenConfig,
}: {
  config: TokenomicsRevenueConfig;
  connection: Connection;
  epoch: DistributionEpochSnapshot;
  tokenConfig: TokenConfigSnapshot;
}): Promise<CalculatedArtifact> {
  if (
    !config.calculationCodeCommit ||
    !config.artifactBaseUrl ||
    !config.projectionToken
  ) {
    throw new Error(
      "Epoch calculation requires TYCHE_TOKENOMICS_CALCULATION_CODE_COMMIT, TYCHE_TOKENOMICS_ARTIFACT_BASE_URL, and TOKENOMICS_PROJECTION_TOKEN.",
    );
  }
  const firstTurn = await fetchTurnBoundary(
    connection,
    config,
    Number(epoch.firstTurnId),
  );
  const lastTurn = await fetchTurnBoundary(
    connection,
    config,
    Number(epoch.lastTurnId),
  );
  const epochStartsAt = BigInt(firstTurn.startTimestamp);
  const epochEndsAt = BigInt(lastTurn.endTimestamp);
  const positions = await fetchLockPositions(
    connection,
    config.tokenomicsProgramId,
  );
  const history = await fetchLockHistory(
    connection,
    config.tokenomicsProgramId,
  );
  const epochEvents = selectEpochLockEvents(
    history.events,
    positions,
    epochStartsAt,
    epochEndsAt,
  );
  const weights = calculatePositionWeights(
    epochEvents,
    positions,
    epochStartsAt,
    epochEndsAt,
  );
  const input: EpochCalculatorInput = {
    epochId: epoch.epochId.toString(),
    finalisedFeesLamports: epoch.finalisedFeesLamports.toString(),
    network: tokenConfig.network,
    positions: weights.map(({ beneficiary, position, weight }) => ({
      beneficiary: beneficiary.toBuffer().toString("hex"),
      position: position.toBuffer().toString("hex"),
      weight: weight.toString(),
    })),
    programId: config.tokenomicsProgramId.toBuffer().toString("hex"),
    rolloverInLamports: epoch.rolloverInLamports.toString(),
  };
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "tyche-epoch-"));
  let rust: EpochCalculatorOutput;
  try {
    const inputPath = join(temporaryDirectory, "input.json");
    await writeFile(inputPath, JSON.stringify(input), "utf8");
    rust = await runRustEpochCalculator(inputPath);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
  const output = requireIndependentEpochAgreement(input, rust).typescript;
  const leaves: TreasuryDistributionLeaf[] = output.claims.map((claim) => ({
    amountLamports: BigInt(claim.amountLamports),
    asset: "SOL",
    beneficiary: Uint8Array.from(Buffer.from(claim.beneficiary, "hex")),
    epochId: epoch.epochId,
    network: tokenConfig.network,
    positionId: Uint8Array.from(Buffer.from(claim.position, "hex")),
    programId: config.tokenomicsProgramId.toBytes(),
  }));
  const tree = leaves.length > 0 ? buildMerkleTree(leaves) : null;
  const leafFileHash = hashCanonicalLeafFile(leaves);
  const eventHash = sha256Hex(
    JSON.stringify(epochEvents.map(serializeLockEvent)),
  );
  const intervalHash = sha256Hex(
    JSON.stringify(
      weights.map((weight) => ({
        position: weight.position.toBase58(),
        weight: weight.weight.toString(),
      })),
    ),
  );
  const manifest = {
    calculationCodeCommit: config.calculationCodeCommit,
    epochId: epoch.epochId.toString(),
    grossDistributableLamports: output.grossDistributableLamports,
    leafFileHash,
    lockEventInputHash: eventHash,
    lockIntervalOutputHash: intervalHash,
    network: tokenConfig.network,
    programId: config.tokenomicsProgramId.toBuffer().toString("hex"),
    rolloverOutLamports: output.rolloverOutLamports,
    schemaVersion: "1",
    slotEnd: requireEpochLifecycleSlot(
      history.closedSlots,
      epoch.epochId,
      "collection close",
    ).toString(),
    slotStart: requireEpochLifecycleSlot(
      history.openedSlots,
      epoch.epochId,
      "open",
    ).toString(),
    sumOfMerkleClaimsLamports: output.sumOfMerkleClaimsLamports,
    totalWeight: output.totalWeight,
  };
  const manifestHash = hashEpochManifest({
    calculationCodeCommit: manifest.calculationCodeCommit,
    epochId: BigInt(manifest.epochId),
    grossDistributableLamports: BigInt(manifest.grossDistributableLamports),
    leafFileHash,
    lockEventInputHash: eventHash,
    lockIntervalOutputHash: intervalHash,
    network: manifest.network,
    programId: manifest.programId,
    rolloverOutLamports: BigInt(manifest.rolloverOutLamports),
    schemaVersion: manifest.schemaVersion,
    slotEnd: BigInt(manifest.slotEnd),
    slotStart: BigInt(manifest.slotStart),
    sumOfMerkleClaimsLamports: BigInt(manifest.sumOfMerkleClaimsLamports),
    totalWeight: BigInt(manifest.totalWeight),
  });
  const claims = output.claims.map((claim) => ({
    ...claim,
    proof: tree
      ? createMerkleProof(tree, Buffer.from(claim.leafHash, "hex")).map(
          (node) => Buffer.from(node).toString("hex"),
        )
      : [],
  }));
  const uri = `${config.artifactBaseUrl.replace(/\/$/u, "")}/tokenomics/artifacts/${manifestHash}`;
  if (Buffer.byteLength(uri, "utf8") > MAX_ARTIFACT_URI_BYTES) {
    throw new Error(
      `Tokenomics artifact URI exceeds ${MAX_ARTIFACT_URI_BYTES} UTF-8 bytes.`,
    );
  }
  const artifact: CalculatedArtifact = {
    claims,
    leafFileHash,
    manifest,
    manifestHash,
    merkleRoot: output.merkleRoot,
    output,
    uri,
  };
  const response = await fetch(
    new URL("/tokenomics/artifacts", config.apiBaseUrl),
    {
      body: JSON.stringify({
        claims,
        leafFileHash,
        manifest,
        manifestHash,
        merkleRoot: output.merkleRoot,
      }),
      headers: {
        authorization: `Bearer ${config.projectionToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Tokenomics artifact persistence failed with HTTP ${response.status}.`,
    );
  }
  return artifact;
}

function calculatePositionWeights(
  events: readonly LockChangedEvent[],
  positions: readonly LockPositionSnapshot[],
  startsAt: bigint,
  endsAt: bigint,
) {
  if (endsAt <= startsAt) throw new Error("Invalid epoch time boundary.");
  return positions
    .map((position) => {
      const changes = events
        .filter((event) => event.position.equals(position.position))
        .sort(compareLockEvents);
      let locked = 0n;
      let cursor = startsAt;
      let weight = 0n;
      for (const change of changes) {
        if (change.timestamp <= startsAt) {
          locked = change.lockedAtoms;
          continue;
        }
        if (change.timestamp >= endsAt) break;
        weight += locked * (change.timestamp - cursor);
        locked = change.lockedAtoms;
        cursor = change.timestamp;
      }
      weight += locked * (endsAt - cursor);
      return {
        beneficiary: position.beneficiary,
        position: position.position,
        weight,
      };
    })
    .filter((position) => position.weight > 0n)
    .sort((left, right) =>
      Buffer.compare(left.position.toBuffer(), right.position.toBuffer()),
    );
}

function selectEpochLockEvents(
  events: readonly LockChangedEvent[],
  positions: readonly LockPositionSnapshot[],
  startsAt: bigint,
  endsAt: bigint,
) {
  const selected: LockChangedEvent[] = [];
  for (const position of positions) {
    const changes = events
      .filter(
        (event) =>
          event.position.equals(position.position) && event.timestamp <= endsAt,
      )
      .sort(compareLockEvents);
    const lastBeforeStart = changes
      .filter((event) => event.timestamp <= startsAt)
      .at(-1);
    if (lastBeforeStart) {
      selected.push(lastBeforeStart);
    }
    selected.push(
      ...changes.filter(
        (event) => event.timestamp > startsAt && event.timestamp <= endsAt,
      ),
    );
  }
  return selected.sort(compareLockEvents);
}

async function fetchLockPositions(
  connection: Connection,
  programId: PublicKey,
) {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: FINALIZED,
    filters: [
      { dataSize: LOCK_POSITION_SIZE },
      {
        memcmp: {
          bytes: LOCK_POSITION_DISCRIMINATOR.toString("base64"),
          encoding: "base64",
          offset: 0,
        },
      },
    ],
  });
  return accounts.map(({ account, pubkey }): LockPositionSnapshot => {
    assertDiscriminator(
      account.data,
      LOCK_POSITION_DISCRIMINATOR,
      "LockPosition",
    );
    return {
      beneficialOwner: new PublicKey(account.data.subarray(8, 40)),
      beneficiary: new PublicKey(account.data.subarray(104, 136)),
      lockedAtoms: account.data.readBigUInt64LE(168),
      position: pubkey,
      returnTokenAccount: new PublicKey(account.data.subarray(72, 104)),
    };
  });
}

async function fetchLockHistory(connection: Connection, programId: PublicKey) {
  const signatures: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> =
    [];
  let before: string | undefined;
  for (let page = 0; page < MAX_SIGNATURE_PAGES; page += 1) {
    const batch = await connection.getSignaturesForAddress(
      programId,
      before ? { before, limit: 1_000 } : { limit: 1_000 },
      "finalized",
    );
    signatures.push(...batch.filter((entry) => entry.err === null));
    if (batch.length < 1_000) break;
    before = batch.at(-1)?.signature;
    if (page === MAX_SIGNATURE_PAGES - 1) {
      throw new Error(
        "Tokenomics lock history exceeded the bounded finalized backfill.",
      );
    }
  }
  const events: LockChangedEvent[] = [];
  const openedSlots = new Map<string, number>();
  const closedSlots = new Map<string, number>();
  for (let offset = 0; offset < signatures.length; offset += 100) {
    const slice = signatures.slice(offset, offset + 100);
    const transactions = await connection.getTransactions(
      slice.map((entry) => entry.signature),
      { commitment: "finalized", maxSupportedTransactionVersion: 0 },
    );
    transactions.forEach((transaction, index) => {
      if (!transaction?.meta || transaction.meta.err) return;
      const signature = slice[index]?.signature;
      if (!signature) return;
      transaction.meta.logMessages?.forEach((line, logIndex) => {
        if (!line.startsWith("Program data: ")) return;
        const data = Buffer.from(line.slice("Program data: ".length), "base64");
        if (data.subarray(0, 8).equals(EPOCH_OPENED_DISCRIMINATOR)) {
          openedSlots.set(data.readBigUInt64LE(8).toString(), transaction.slot);
          return;
        }
        if (data.subarray(0, 8).equals(EPOCH_COLLECTION_CLOSED_DISCRIMINATOR)) {
          closedSlots.set(data.readBigUInt64LE(8).toString(), transaction.slot);
          return;
        }
        if (!data.subarray(0, 8).equals(LOCK_CHANGED_DISCRIMINATOR)) return;
        const cursor = new Cursor(data, 8);
        const position = cursor.publicKey();
        cursor.publicKey(); // beneficial owner
        const amountAtoms = cursor.u64();
        const lockedAtoms = cursor.u64();
        const timestamp = cursor.i64();
        const kind = cursor.u8();
        if (kind !== 0 && kind !== 1)
          throw new Error("Unknown LockChange enum.");
        events.push({
          amountAtoms,
          lockedAtoms,
          logIndex,
          position,
          signature,
          slot: transaction.slot,
          timestamp,
          type: kind === 0 ? "lock" : "unlock",
        });
      });
    });
  }
  events.sort(compareLockEvents);
  const slots =
    signatures.length > 0
      ? events.map((event) => event.slot)
      : [await connection.getSlot(FINALIZED)];
  const finalizedSlot = await connection.getSlot(FINALIZED);
  return {
    closedSlots,
    events,
    openedSlots,
    slotEnd: BigInt(finalizedSlot),
    slotStart: BigInt(Math.min(...slots, finalizedSlot)),
  };
}

function requireEpochLifecycleSlot(
  slots: ReadonlyMap<string, number>,
  epochId: bigint,
  label: string,
) {
  const slot = slots.get(epochId.toString());
  if (slot === undefined) {
    throw new Error(
      `Finalized epoch ${label} event is missing for ${epochId}.`,
    );
  }
  return BigInt(slot);
}

function bridgeInstruction(args: {
  authority: PublicKey;
  config: TokenomicsRevenueConfig;
  distributionVault: PublicKey;
  epoch: PublicKey;
  tokenConfig: PublicKey;
  turn: PublicKey;
  turnId: number;
}) {
  const tycheProgram = new PublicKey(
    args.config.automation.programId.toString(),
  );
  return new TransactionInstruction({
    data: BRIDGE_TURN_TREASURY_FEE_DISCRIMINATOR,
    keys: [
      { isSigner: true, isWritable: false, pubkey: args.authority },
      {
        isSigner: false,
        isWritable: false,
        pubkey: pda(tycheProgram, ["global_config"]),
      },
      { isSigner: false, isWritable: true, pubkey: args.turn },
      {
        isSigner: false,
        isWritable: true,
        pubkey: pda(tycheProgram, ["treasury_vault"]),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: args.config.tokenomicsProgramId,
      },
      { isSigner: false, isWritable: false, pubkey: args.tokenConfig },
      { isSigner: false, isWritable: true, pubkey: args.epoch },
      { isSigner: false, isWritable: true, pubkey: args.distributionVault },
    ],
    programId: tycheProgram,
  });
}

function closeCollectionInstruction(args: {
  authority: PublicKey;
  config: TokenomicsRevenueConfig;
  epoch: PublicKey;
  lastTurnId: bigint;
  tokenConfig: PublicKey;
}) {
  const tycheProgram = new PublicKey(
    args.config.automation.programId.toString(),
  );
  return new TransactionInstruction({
    data: Buffer.concat([
      CLOSE_TOKENOMICS_EPOCH_COLLECTION_DISCRIMINATOR,
      u64(args.lastTurnId),
    ]),
    keys: [
      { isSigner: true, isWritable: false, pubkey: args.authority },
      {
        isSigner: false,
        isWritable: false,
        pubkey: pda(tycheProgram, ["global_config"]),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: args.config.tokenomicsProgramId,
      },
      { isSigner: false, isWritable: false, pubkey: args.tokenConfig },
      { isSigner: false, isWritable: true, pubkey: args.epoch },
    ],
    programId: tycheProgram,
  });
}

function publishRootInstruction(args: {
  artifact: CalculatedArtifact;
  config: TokenomicsRevenueConfig;
  correctionReserveVault: PublicKey;
  distributionVault: PublicKey;
  epoch: PublicKey;
  publisher: PublicKey;
  rootVersion: number;
  tokenConfig: PublicKey;
}) {
  const root = args.artifact.merkleRoot
    ? Buffer.from(args.artifact.merkleRoot, "hex")
    : Buffer.alloc(32);
  const uri = Buffer.from(args.artifact.uri, "utf8");
  return new TransactionInstruction({
    data: Buffer.concat([
      PUBLISH_PROVISIONAL_ROOT_DISCRIMINATOR,
      u32(args.rootVersion),
      u128(BigInt(args.artifact.output.totalWeight)),
      u64(BigInt(args.artifact.output.sumOfMerkleClaimsLamports)),
      root,
      Buffer.from(args.artifact.manifestHash, "hex"),
      Buffer.from(args.artifact.leafFileHash, "hex"),
      Buffer.from(args.artifact.manifest.calculationCodeCommit ?? "", "hex"),
      u32(uri.length),
      uri,
    ]),
    keys: [
      { isSigner: true, isWritable: true, pubkey: args.publisher },
      { isSigner: false, isWritable: true, pubkey: args.tokenConfig },
      { isSigner: false, isWritable: true, pubkey: args.epoch },
      { isSigner: false, isWritable: false, pubkey: args.distributionVault },
      {
        isSigner: false,
        isWritable: false,
        pubkey: args.correctionReserveVault,
      },
    ],
    programId: args.config.tokenomicsProgramId,
  });
}

async function simulateSendAndIndex(args: {
  config: TokenomicsRevenueConfig;
  connection: Connection;
  eventKind: string;
  instruction: TransactionInstruction;
  payer: Keypair;
  payload: Record<string, unknown>;
}) {
  const latest = await args.connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: [args.instruction],
      payerKey: args.payer.publicKey,
      recentBlockhash: latest.blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([args.payer]);
  const simulation = await args.connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `Tokenomics revenue simulation failed: ${JSON.stringify(simulation.value.err)}; logs=${JSON.stringify(simulation.value.logs ?? [])}`,
    );
  }
  const signature = await args.connection.sendRawTransaction(
    transaction.serialize(),
    {
      maxRetries: 3,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    },
  );
  const confirmation = await args.connection.confirmTransaction(
    { ...latest, signature },
    FINALIZED,
  );
  if (confirmation.value.err) {
    throw new Error(`Tokenomics revenue transaction ${signature} failed.`);
  }
  await persistFinalizedTransaction({
    cluster: "devnet",
    connection: args.connection,
    eventKind: args.eventKind,
    payload: args.payload,
    signature,
  });
  return signature;
}

async function fetchTurnBoundary(
  connection: Connection,
  config: TokenomicsRevenueConfig,
  turnId: number,
) {
  const account = await connection.getAccountInfo(
    pda(new PublicKey(config.automation.programId.toString()), [
      "turn",
      u64(BigInt(turnId)),
    ]),
    FINALIZED,
  );
  if (
    !account ||
    account.data.length !== TURN_STATE_SIZE ||
    account.data[32] === 0
  ) {
    throw new Error(`Turn ${turnId} is not finalized in the current layout.`);
  }
  return {
    endTimestamp: Number(account.data.readBigInt64LE(24)),
    startTimestamp: Number(account.data.readBigInt64LE(16)),
  };
}

async function fetchOptionalTurnBoundary(
  connection: Connection,
  config: TokenomicsRevenueConfig,
  turnId: number,
) {
  const account = await connection.getAccountInfo(
    pda(new PublicKey(config.automation.programId.toString()), [
      "turn",
      u64(BigInt(turnId)),
    ]),
    FINALIZED,
  );
  if (!account || account.data.length !== TURN_STATE_SIZE) {
    return null;
  }
  return {
    endTimestamp: Number(account.data.readBigInt64LE(24)),
    startTimestamp: Number(account.data.readBigInt64LE(16)),
  };
}

function requirePublisher(
  config: TokenomicsRevenueConfig,
  tokenConfig: TokenConfigSnapshot,
) {
  if (!config.publisherKeypairBytes) return null;
  const publisher = Keypair.fromSecretKey(config.publisherKeypairBytes);
  if (!publisher.publicKey.equals(tokenConfig.epochRootPublisher)) {
    throw new Error(
      `Configured epoch publisher ${publisher.publicKey.toBase58()} does not match TokenConfig ${tokenConfig.epochRootPublisher.toBase58()}.`,
    );
  }
  return publisher;
}

function compareLockEvents(left: LockChangedEvent, right: LockChangedEvent) {
  return (
    left.slot - right.slot ||
    left.logIndex - right.logIndex ||
    left.signature.localeCompare(right.signature)
  );
}

function serializeLockEvent(event: LockChangedEvent) {
  return {
    amountAtoms: event.amountAtoms.toString(),
    lockedAtoms: event.lockedAtoms.toString(),
    logIndex: event.logIndex,
    position: event.position.toBase58(),
    signature: event.signature,
    slot: event.slot,
    timestamp: event.timestamp.toString(),
    type: event.type,
  };
}

function pda(programId: PublicKey, seeds: Array<string | Buffer>) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => (typeof seed === "string" ? Buffer.from(seed) : seed)),
    programId,
  )[0];
}

function discriminator(namespace: string) {
  return createHash("sha256").update(namespace).digest().subarray(0, 8);
}

function assertDiscriminator(data: Buffer, expected: Buffer, label: string) {
  if (data.length < 8 || !data.subarray(0, 8).equals(expected)) {
    throw new Error(`${label} account discriminator is invalid.`);
  }
}

function nullableHash(hash: Buffer) {
  return hash.equals(Buffer.alloc(32)) ? null : hash.toString("hex");
}

function decodeEpochStatus(value: number): EpochStatus {
  const statuses: EpochStatus[] = [
    "collecting",
    "calculating",
    "provisional",
    "challenged",
    "cancelled",
    "expired_unresolved",
    "sealed",
    "rolled_over_no_weight",
  ];
  const status = statuses[value];
  if (!status) throw new Error("DistributionEpoch status is invalid.");
  return status;
}

function decodeCampaignState(value: number) {
  const states = ["draft", "funded", "exhausted", "ended"] as const;
  const state = states[value];
  if (!state) {
    throw new Error("CampaignReserve state is invalid.");
  }
  return state;
}

function u32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function u128(value: bigint) {
  const buffer = Buffer.alloc(16);
  buffer.writeBigUInt64LE(value & 0xffff_ffff_ffff_ffffn, 0);
  buffer.writeBigUInt64LE(value >> 64n, 8);
  return buffer;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

class Cursor {
  constructor(
    private readonly data: Buffer,
    private offset: number,
  ) {}

  bool() {
    return this.u8() !== 0;
  }

  hash32() {
    return this.bytes(32);
  }

  i64() {
    const value = this.data.readBigInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  publicKey() {
    return new PublicKey(this.bytes(32));
  }

  string() {
    const length = this.u32();
    return this.bytes(length).toString("utf8");
  }

  u8() {
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u32() {
    const value = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  u64() {
    const value = this.data.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  u128() {
    const low = this.u64();
    return low | (this.u64() << 64n);
  }

  private bytes(length: number) {
    if (this.offset + length > this.data.length) {
      throw new Error("Borsh account data is truncated.");
    }
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}
