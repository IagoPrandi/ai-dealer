import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type Commitment,
  type TransactionInstruction,
} from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import {
  closeTurnManually,
  createManualControlConfig,
  openTurnManually,
} from "./manual-control.js";
import {
  createProposeRuleInstruction,
  createSubmitGuessInstruction,
  createPrecompileRuleInstruction,
  createVoteRuleInstruction,
  deterministicGuess,
  deterministicPlayer,
  fetchRulePreflight,
  postJson,
  runStoredRuleValidation,
  sendTransaction,
} from "./devnet-seed-real-inputs.js";
import {
  createSettlementCycleDeps,
  createSettlementSchedulerConfig,
  runSettlementSchedulerOnce,
} from "./settlement-loop.js";
import {
  decodeSettlementTurnState,
  fetchRuleElectionCutoffBps,
} from "./settlement.js";
import {
  createSetTurnDurationCycleInstruction,
  createTurnAutomationConfig,
  deriveAuthorityAddress,
  fetchGlobalConfig,
  fetchTurnState,
  simulateAndSend,
  stringifySimulationError,
  type SolanaAddress,
} from "./turn-automation.js";

/**
 * Devnet acceptance operator: 10 deterministic players, 10 wallets, 10 prompts
 * from docs/rule-proposal-prompt-test-set.md, real guess/proposal/approval
 * votes, elimination votes, settlement, claim attempt, and expired-claim probe.
 *
 * Dry-run by default. Set TYCHE_10P_SIM_BROADCAST=1 to send devnet
 * transactions. This is intentionally manual-control based and test-only.
 */

const BROADCAST = process.env.TYCHE_10P_SIM_BROADCAST === "1";
const PLAYER_COUNT = 10;
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3002";
const COMMITMENT: Commitment = "confirmed";
const ELIMINATION_VOTE_DISCRIMINATOR = createAnchorDiscriminator(
  "global:eliminate_vote_rule",
);
const CLAIM_PRIZE_DISCRIMINATOR = createAnchorDiscriminator("global:claim_prize");
const CLAIM_KIND_WINNER_PAYOUT = 0;

const execFileAsync = promisify(execFile);

interface SimulationConfig {
  apiBaseUrl: string;
  funderKeypairPath: string | null;
  fundLamportsPerPlayer: number;
  promptFile: string;
  promptMarkdown: string | null;
  skipAirdrop: boolean;
}

interface ClaimRecord {
  amountLamports?: number;
  claimId?: string;
  kind: string;
  status: string;
  wallet: string;
}

export function readTenPlayerSimulationConfig(
  env = process.env,
): SimulationConfig {
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    funderKeypairPath: env.TYCHE_10P_SIM_FUNDER_KEYPAIR_PATH ?? null,
    fundLamportsPerPlayer: parseSolToLamports(
      env.TYCHE_10P_SIM_FUNDER_SOL_PER_PLAYER ?? "2",
    ),
    promptFile:
      env.TYCHE_10P_SIM_PROMPT_FILE ??
      "docs/rule-proposal-prompt-test-set.md",
    promptMarkdown: env.TYCHE_10P_SIM_PROMPT_MARKDOWN ?? null,
    skipAirdrop: env.TYCHE_10P_SIM_SKIP_AIRDROP === "1",
  };
}

export function parseSolToLamports(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error(
      "TYCHE_10P_SIM_FUNDER_SOL_PER_PLAYER must be a positive SOL amount with up to 9 decimal places.",
    );
  }
  const parts = trimmed.split(".");
  const wholePart = parts[0];
  const fractionalPart = parts[1] ?? "";
  if (!wholePart) {
    throw new Error(
      "TYCHE_10P_SIM_FUNDER_SOL_PER_PLAYER must include a whole SOL part.",
    );
  }
  const lamports =
    BigInt(wholePart) * BigInt(LAMPORTS_PER_SOL) +
    BigInt(fractionalPart.padEnd(9, "0"));
  if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      "TYCHE_10P_SIM_FUNDER_SOL_PER_PLAYER must resolve to a safe positive lamport amount.",
    );
  }
  return Number(lamports);
}

export function readValidRulePromptsFromMarkdown(
  markdown: string,
  limit = PLAYER_COUNT,
) {
  const prompts: string[] = [];
  const rowPattern = /^\|\s*(\d+)\s*\|\s*VALID\s*\|\s*(.*?)\s*\|$/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const prompt = match[2]?.trim();
    if (prompt) {
      prompts.push(prompt);
    }
    if (prompts.length >= limit) {
      break;
    }
  }
  if (prompts.length < limit) {
    throw new Error(
      `Prompt test set has only ${prompts.length} VALID prompts; ${limit} required.`,
    );
  }
  return prompts;
}

function resolvePromptFilePath(promptFile: string) {
  if (existsSync(promptFile)) {
    return promptFile;
  }
  const fromRepoRoot = resolve(process.cwd(), "..", "..", promptFile);
  if (existsSync(fromRepoRoot)) {
    return fromRepoRoot;
  }
  return promptFile;
}

function requiredPrompt(prompts: readonly string[], index: number) {
  const prompt = prompts[index] ?? prompts[0];
  if (!prompt) {
    throw new Error("10-player simulation requires at least one rule prompt.");
  }
  return prompt;
}

function createAnchorDiscriminator(name: string) {
  return createHash("sha256").update(name).digest().subarray(0, 8);
}

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function ruleProposalPda(programId: PublicKey, turnId: number, ruleId: number) {
  return derivePda(programId, [
    Buffer.from("rule"),
    u64Le(turnId),
    u64Le(ruleId),
  ]);
}

function ruleEliminationVotePda({
  programId,
  ruleId,
  sequence,
  turnId,
  voter,
}: {
  programId: PublicKey;
  ruleId: number;
  sequence: number;
  turnId: number;
  voter: PublicKey;
}) {
  return derivePda(programId, [
    Buffer.from("elimination_vote"),
    u64Le(turnId),
    u64Le(ruleId),
    voter.toBuffer(),
    u64Le(sequence),
  ]);
}

function createEliminationVoteInstruction({
  player,
  programId,
  ruleId,
  sequence,
  turnId,
}: {
  player: PublicKey;
  programId: PublicKey;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  const ruleProposal = ruleProposalPda(programId, turnId, ruleId);
  const eliminationVote = ruleEliminationVotePda({
    programId,
    ruleId,
    sequence,
    turnId,
    voter: player,
  });

  return {
    eliminationVote,
    instruction: {
      data: Buffer.concat([ELIMINATION_VOTE_DISCRIMINATOR, u64Le(sequence)]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: player },
        {
          isSigner: false,
          isWritable: false,
          pubkey: derivePda(programId, [Buffer.from("global_config")]),
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: derivePda(programId, [Buffer.from("turn"), u64Le(turnId)]),
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: derivePda(programId, [
            Buffer.from("game_token"),
            u64Le(turnId),
            player.toBuffer(),
          ]),
        },
        { isSigner: false, isWritable: false, pubkey: ruleProposal },
        { isSigner: false, isWritable: true, pubkey: eliminationVote },
        {
          isSigner: false,
          isWritable: true,
          pubkey: derivePda(programId, [
            Buffer.from("prize_vault"),
            u64Le(turnId),
          ]),
        },
        {
          isSigner: false,
          isWritable: false,
          pubkey: new PublicKey("11111111111111111111111111111111"),
        },
      ],
      programId,
    } satisfies TransactionInstruction,
    ruleProposal,
  };
}

function createClaimPrizeInstruction({
  claimant,
  programId,
  turnId,
}: {
  claimant: PublicKey;
  programId: PublicKey;
  turnId: number;
}) {
  return {
    claim: derivePda(programId, [
      Buffer.from("claim"),
      u64Le(turnId),
      claimant.toBuffer(),
      Buffer.from([CLAIM_KIND_WINNER_PAYOUT]),
    ]),
    instruction: {
      data: Buffer.concat([CLAIM_PRIZE_DISCRIMINATOR, u64Le(turnId)]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: claimant },
        {
          isSigner: false,
          isWritable: false,
          pubkey: derivePda(programId, [Buffer.from("global_config")]),
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: derivePda(programId, [
            Buffer.from("claim"),
            u64Le(turnId),
            claimant.toBuffer(),
            Buffer.from([CLAIM_KIND_WINNER_PAYOUT]),
          ]),
        },
        {
          isSigner: false,
          isWritable: true,
          pubkey: derivePda(programId, [
            Buffer.from("prize_vault"),
            u64Le(turnId),
          ]),
        },
      ],
      programId,
    } satisfies TransactionInstruction,
  };
}

async function airdropWallet(address: string) {
  if (!BROADCAST) {
    return "dry-run:airdrop";
  }
  const { stdout, stderr } = await execFileAsync("solana", [
    "airdrop",
    "2",
    address,
    "--url",
    "devnet",
  ]);
  const output = `${stdout}${stderr}`.trim();
  return output || "airdrop:ok";
}

function loadKeypairFromFile(path: string) {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every(
      (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
    )
  ) {
    throw new Error(`${path} must contain a 64-byte Solana keypair JSON array.`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

async function fundWalletFromFunder({
  connection,
  funder,
  lamports,
  wallet,
}: {
  connection: Connection;
  funder: Keypair;
  lamports: number;
  wallet: PublicKey;
}) {
  const balance = await connection.getBalance(funder.publicKey, COMMITMENT);
  if (balance < lamports) {
    throw new Error(
      `Simulation funder ${funder.publicKey.toBase58()} has ${balance} lamports; ${lamports} lamports are required for ${wallet.toBase58()}.`,
    );
  }
  return sendTransaction({
    connection,
    feePayer: funder.publicKey,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        lamports,
        toPubkey: wallet,
      }),
    ],
    label: `10p_fund_player:${wallet.toBase58()}`,
    signers: [funder],
  });
}

async function fetchCurrentTurnId() {
  const automation = await createTurnAutomationConfig();
  const globalConfig = await fetchGlobalConfig({
    programId: automation.programId,
    rpc: createSolanaRpc(automation.rpcUrl),
  });
  if (!globalConfig.snapshot.hasActiveTurn) {
    throw new Error("No active turn exists after manual open.");
  }
  return globalConfig.snapshot.activeTurnId;
}

async function shrinkOpenTurnToEndPlayWindow({
  authorityKeypairBytes,
  programId,
  rpcUrl,
  turnId,
}: {
  authorityKeypairBytes: Uint8Array;
  programId: SolanaAddress;
  rpcUrl: string;
  turnId: number;
}) {
  const rpc = createSolanaRpc(rpcUrl);
  const [globalConfig, activeTurn] = await Promise.all([
    fetchGlobalConfig({ programId, rpc }),
    fetchTurnState({ programId, rpc, turnId }),
  ]);
  if (activeTurn.snapshot.status !== "open") {
    throw new Error(`Turn ${turnId} is not open.`);
  }
  const shrunkCycle = [...globalConfig.snapshot.turnDurationCycle] as [
    number,
    number,
    number,
    number,
  ];
  shrunkCycle[activeTurn.snapshot.cycleIndex] = 1;
  const instruction = await createSetTurnDurationCycleInstruction({
    authority: deriveAuthorityAddress(authorityKeypairBytes),
    programId,
    turnDurationCycle: shrunkCycle,
    turnState: activeTurn.address,
  });
  const signature = await simulateAndSend({
    authorityKeypairBytes,
    instruction,
    rpc,
  });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return signature.toString();
}

async function fetchSettlementState({
  connection,
  programId,
  turnId,
}: {
  connection: Connection;
  programId: PublicKey;
  turnId: number;
}) {
  const account = await connection.getAccountInfo(
    derivePda(programId, [Buffer.from("turn"), u64Le(turnId)]),
    COMMITMENT,
  );
  if (!account) {
    throw new Error(`TurnState ${turnId} not found.`);
  }
  const ruleElectionCutoffBps = await fetchRuleElectionCutoffBps({
    connection,
    programId,
  });
  return decodeSettlementTurnState(account.data, ruleElectionCutoffBps);
}

async function runSettlementUntil({
  connection,
  label,
  predicate,
  programId,
  turnId,
}: {
  connection: Connection;
  label: string;
  predicate: (state: ReturnType<typeof decodeSettlementTurnState>) => boolean;
  programId: PublicKey;
  turnId: number;
}) {
  const config = { ...(await createSettlementSchedulerConfig()), enabled: true };
  const deps = createSettlementCycleDeps(config);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await fetchSettlementState({ connection, programId, turnId });
    if (predicate(state)) {
      return state;
    }
    const result = await runSettlementSchedulerOnce(config, deps);
    console.log(`${label} settlement step ${attempt}: ${JSON.stringify(result)}`);
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }

  throw new Error(`Settlement did not reach ${label} within 60 attempts.`);
}

async function fetchClaims(apiBaseUrl: string, turnId: number) {
  const response = await fetch(new URL(`/claim-records?turnId=${turnId}`, apiBaseUrl));
  const payload = (await response.json()) as { claims?: { records?: ClaimRecord[] } };
  if (!response.ok) {
    throw new Error(`/claim-records returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload.claims?.records ?? [];
}

async function claimFirstAvailablePrize({
  apiBaseUrl,
  connection,
  players,
  programId,
  turnId,
}: {
  apiBaseUrl: string;
  connection: Connection;
  players: Keypair[];
  programId: PublicKey;
  turnId: number;
}) {
  const playerByWallet = new Map(
    players.map((player) => [player.publicKey.toBase58(), player]),
  );
  const target = (await fetchClaims(apiBaseUrl, turnId)).find(
    (claim) =>
      claim.kind === "winner_payout" &&
      claim.status === "available" &&
      playerByWallet.has(claim.wallet),
  );
  if (!target) {
    return { status: "skipped", reason: "no_available_seeded_winner_claim" };
  }
  const claimant = playerByWallet.get(target.wallet);
  if (!claimant) {
    throw new Error("Selected claim does not map to a seeded player.");
  }
  const built = createClaimPrizeInstruction({
    claimant: claimant.publicKey,
    programId,
    turnId,
  });
  const signature = await sendTransaction({
    connection,
    feePayer: claimant.publicKey,
    instructions: [built.instruction],
    label: "10p_claim_prize",
    signers: [claimant],
  });
  if (target.claimId) {
    await fetch(new URL("/claim-records/request", apiBaseUrl), {
      body: JSON.stringify({ claimId: target.claimId, wallet: target.wallet }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await fetch(new URL("/claim-records/complete", apiBaseUrl), {
      body: JSON.stringify({
        claimId: target.claimId,
        signature,
        status: "claimed",
        wallet: target.wallet,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }
  return {
    amountLamports: target.amountLamports ?? null,
    claimId: target.claimId ?? null,
    claimPda: built.claim.toBase58(),
    signature,
    status: "claimed",
    wallet: target.wallet,
  };
}

async function expireUnclaimedClaims(apiBaseUrl: string, turnId: number) {
  const response = await fetch(new URL("/claim-records/expire-unclaimed", apiBaseUrl), {
    body: JSON.stringify({
      currentTurnId: turnId + 12,
      settledAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000).toISOString(),
      sourceTurnId: turnId,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  return { httpStatus: response.status, payload };
}

export async function runTenPlayerSimulation() {
  const config = readTenPlayerSimulationConfig();
  const prompts = readValidRulePromptsFromMarkdown(
    config.promptMarkdown ??
      readFileSync(resolvePromptFilePath(config.promptFile), "utf8"),
  );

  process.env.TYCHE_M5_INPUTS_BROADCAST = BROADCAST ? "1" : "0";

  const automation = await createTurnAutomationConfig();
  const programId = new PublicKey(automation.programId.toString());
  const connection = new Connection(automation.rpcUrl, COMMITMENT);

  if (!BROADCAST) {
    const dryTurnId = Number(process.env.TYCHE_10P_SIM_DRY_TURN_ID ?? 1);
    const dryPlayers = Array.from({ length: PLAYER_COUNT }, (_, index) =>
      deterministicPlayer(dryTurnId, index),
    );
    return {
      apiBaseUrl: config.apiBaseUrl,
      broadcast: false,
      fundLamportsPerPlayer: config.fundLamportsPerPlayer,
      funderWallet: config.funderKeypairPath
        ? loadKeypairFromFile(config.funderKeypairPath).publicKey.toBase58()
        : null,
      openedRequiredMarkdown: ["PRD.md", "docs/rule-proposal-prompt-test-set.md", ".claude/skills"],
      plannedActions: [
        "manual_open_turn",
        config.funderKeypairPath
          ? "funder_wallet_transfer_each_player_wallet"
          : "solana_airdrop_2_each_player_wallet",
        "submit_guess_each_player",
        "rule_preflight_and_propose_each_player",
        "approval_vote_each_player",
        "manual_shrink_turn_duration_to_end_play_window",
        "settlement_to_elimination_window",
        "elimination_vote_each_player",
        "settlement_to_draw_fulfilled",
        "manual_close_turn",
        "claim_available_prize",
        "expire_one_unclaimed_claim",
      ],
      prompts,
      recordedPlayerSample: dryPlayers.slice(0, 3).map((player, index) => ({
        index,
        wallet: player.publicKey.toBase58(),
      })),
    };
  }

  const manualConfig = await createManualControlConfig();
  if (!automation.authorityKeypairBytes) {
    throw new Error(
      "10-player simulation requires TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }
  const authority = Keypair.fromSecretKey(automation.authorityKeypairBytes);
  const funder = config.funderKeypairPath
    ? loadKeypairFromFile(config.funderKeypairPath)
    : null;
  const opened = await openTurnManually(manualConfig);
  const turnId =
    opened.action === "opened_turn" || opened.action === "active_turn_exists"
      ? opened.turnId
      : await fetchCurrentTurnId();
  const players = Array.from({ length: PLAYER_COUNT }, (_, index) =>
    deterministicPlayer(turnId, index),
  );

  const summary = {
    apiBaseUrl: config.apiBaseUrl,
    approvals: [] as unknown[],
    airdrops: [] as unknown[],
    broadcast: true,
    claims: null as unknown,
    closed: null as unknown,
    eliminationVotes: [] as unknown[],
    fundingTransfers: [] as unknown[],
    fundLamportsPerPlayer: config.fundLamportsPerPlayer,
    funderWallet: funder?.publicKey.toBase58() ?? null,
    guesses: [] as unknown[],
    opened,
    prompts,
    recordedPlayerSample: players.slice(0, 3).map((player, index) => ({
      index,
      wallet: player.publicKey.toBase58(),
    })),
    rules: [] as {
      proposer: string;
      prompt: string;
      ruleId: number;
      ruleProposal: string;
    }[],
    turnId,
    wallets: players.map((player, index) => ({
      index,
      wallet: player.publicKey.toBase58(),
    })),
  };

  for (const player of players) {
    if (config.skipAirdrop) {
      continue;
    }
    if (funder) {
      summary.fundingTransfers.push({
        lamports: config.fundLamportsPerPlayer,
        signature: await fundWalletFromFunder({
          connection,
          funder,
          lamports: config.fundLamportsPerPlayer,
          wallet: player.publicKey,
        }),
        wallet: player.publicKey.toBase58(),
      });
    } else {
      summary.airdrops.push({
        output: await airdropWallet(player.publicKey.toBase58()),
        wallet: player.publicKey.toBase58(),
      });
    }
  }

  for (const [index, player] of players.entries()) {
    const guess = deterministicGuess(index);
    const built = createSubmitGuessInstruction({
      numbers: guess,
      player: player.publicKey,
      programId,
      sequence: 1,
      turnId,
    });
    const signature = await sendTransaction({
      connection,
      feePayer: player.publicKey,
      instructions: [built.instruction],
      label: `10p_submit_guess:${index}`,
      signers: [player],
    });
    await postJson({
      body: {
        gameToken: built.accounts.gameToken.toBase58(),
        numbers: guess,
        player: player.publicKey.toBase58(),
        playerGuess: built.accounts.playerGuess.toBase58(),
        programId: programId.toBase58(),
        sequence: 1,
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
      },
      path: "/guess-receipts",
      seedConfig: {
        apiBaseUrl: config.apiBaseUrl,
        fundLamportsPerPlayer: 0,
        paidGuessPlayerCount: 0,
        playerCount: PLAYER_COUNT,
        ruleText: requiredPrompt(prompts, index),
      },
    });
    summary.guesses.push({ guess, signature, wallet: player.publicKey.toBase58() });
  }

  for (const [index, player] of players.entries()) {
    const prompt = requiredPrompt(prompts, index);
    const seedConfig = {
      apiBaseUrl: config.apiBaseUrl,
      fundLamportsPerPlayer: 0,
      paidGuessPlayerCount: 0,
      playerCount: PLAYER_COUNT,
      ruleText: prompt,
    };
    const preflight = await fetchRulePreflight(seedConfig);
    const proposal = createProposeRuleInstruction({
      player: player.publicKey,
      preflight,
      programId,
      turnId,
    });
    const signature = await sendTransaction({
      connection,
      feePayer: player.publicKey,
      instructions: [proposal.instruction],
      label: `10p_propose_rule:${index}`,
      signers: [player],
    });
    await postJson({
      body: {
        ...preflight,
        compiledArtifactHash: preflight.compiledArtifactHash ?? null,
        precompilationStatus: "pending",
        proposer: player.publicKey.toBase58(),
        ruleProposal: proposal.ruleProposal.toBase58(),
        signature,
        state: "proposed",
        submittedAt: new Date().toISOString(),
        turnId,
      },
      path: "/rule-proposals",
      seedConfig,
    });
    const artifactHash =
      (await runStoredRuleValidation({
        ruleId: preflight.ruleId,
        seedConfig,
        turnId,
      })) ?? preflight.compiledArtifactHash;
    if (!artifactHash) {
      throw new Error(`Rule ${preflight.ruleId} did not produce an artifact hash.`);
    }
    const precompileSignature = await sendTransaction({
      connection,
      feePayer: authority.publicKey,
      instructions: [
        createPrecompileRuleInstruction({
          authority: authority.publicKey,
          compiledArtifactHash: Buffer.from(artifactHash, "hex"),
          programId,
          ruleId: preflight.ruleId,
          turnId,
        }),
      ],
      label: `10p_precompile_rule:${index}`,
      signers: [authority],
    });
    await postJson({
      body: {
        compiledArtifactHash: artifactHash,
        ruleId: preflight.ruleId,
        status: "passed",
        turnId,
        updatedAt: new Date().toISOString(),
      },
      path: "/rule-precompilations",
      seedConfig,
    });
    summary.rules.push({
      proposer: player.publicKey.toBase58(),
      prompt,
      ruleId: preflight.ruleId,
      ruleProposal: proposal.ruleProposal.toBase58(),
    });
    summary.approvals.push({ precompileSignature, ruleId: preflight.ruleId });
  }

  for (const [index, player] of players.entries()) {
    const rule = summary.rules[index % summary.rules.length];
    if (!rule) {
      throw new Error("No proposed rule available for approval vote.");
    }
    const vote = createVoteRuleInstruction({
      player: player.publicKey,
      programId,
      ruleId: rule.ruleId,
      sequence: 1,
      turnId,
    });
    const signature = await sendTransaction({
      connection,
      feePayer: player.publicKey,
      instructions: [vote.instruction],
      label: `10p_vote_for:${index}`,
      signers: [player],
    });
    await postJson({
      body: {
        ruleId: rule.ruleId,
        ruleProposal: vote.ruleProposal.toBase58(),
        ruleVote: vote.ruleVote.toBase58(),
        sequence: 1,
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
        voter: player.publicKey.toBase58(),
      },
      path: "/rule-votes",
      seedConfig: {
        apiBaseUrl: config.apiBaseUrl,
        fundLamportsPerPlayer: 0,
        paidGuessPlayerCount: 0,
        playerCount: PLAYER_COUNT,
        ruleText: rule.prompt,
      },
    });
    summary.approvals.push({ ruleId: rule.ruleId, signature, voter: player.publicKey.toBase58() });
  }

  summary.approvals.push({
    shrinkTurnSignature: await shrinkOpenTurnToEndPlayWindow({
      authorityKeypairBytes: automation.authorityKeypairBytes,
      programId: automation.programId,
      rpcUrl: automation.rpcUrl,
      turnId,
    }),
  });

  const eliminationOpen = await runSettlementUntil({
    connection,
    label: "elimination_window_open",
    predicate: (state) =>
      state.finalistCount > 0 &&
      state.survivorFinalistHash === null &&
      Math.floor(Date.now() / 1_000) < state.eliminationWindowEndSeconds,
    programId,
    turnId,
  });

  for (const [index, player] of players.entries()) {
    const targetRuleId =
      eliminationOpen.finalistRuleIds[index % eliminationOpen.finalistRuleIds.length];
    if (!targetRuleId) {
      throw new Error("No finalist rule available for elimination vote.");
    }
    const vote = createEliminationVoteInstruction({
      player: player.publicKey,
      programId,
      ruleId: targetRuleId,
      sequence: 1,
      turnId,
    });
    const signature = await sendTransaction({
      connection,
      feePayer: player.publicKey,
      instructions: [vote.instruction],
      label: `10p_vote_against:${index}`,
      signers: [player],
    });
    await postJson({
      body: {
        eliminationVote: vote.eliminationVote.toBase58(),
        ruleId: targetRuleId,
        ruleProposal: vote.ruleProposal.toBase58(),
        sequence: 1,
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
        voter: player.publicKey.toBase58(),
      },
      path: "/rule-elimination-votes",
      seedConfig: {
        apiBaseUrl: config.apiBaseUrl,
        fundLamportsPerPlayer: 0,
        paidGuessPlayerCount: 0,
        playerCount: PLAYER_COUNT,
        ruleText: requiredPrompt(prompts, index),
      },
    });
    summary.eliminationVotes.push({
      ruleId: targetRuleId,
      signature,
      voter: player.publicKey.toBase58(),
    });
  }

  await runSettlementUntil({
    connection,
    label: "draw_fulfilled",
    predicate: (state) => state.drawStatus === "fulfilled" && state.status === "open",
    programId,
    turnId,
  });
  summary.closed = await closeTurnManually(manualConfig);
  await runSettlementUntil({
    connection,
    label: "closed_projection",
    predicate: (state) => state.status === "closed",
    programId,
    turnId,
  });

  const claims = await fetchClaims(config.apiBaseUrl, turnId);
  const claimPrize = await claimFirstAvailablePrize({
    apiBaseUrl: config.apiBaseUrl,
    connection,
    players,
    programId,
    turnId,
  });
  const claimsAfterClaim = await fetchClaims(config.apiBaseUrl, turnId);
  const available = claims.filter((claim) => claim.status === "available");
  const expiredProbe =
    claimsAfterClaim.some((claim) => claim.status === "available")
      ? await expireUnclaimedClaims(config.apiBaseUrl, turnId)
      : { status: "skipped", reason: "not_enough_available_claims" };
  summary.claims = {
    availableBeforeClaim: available.length,
    expiredProbe,
    normalClaim: claimPrize,
    records: claims.length,
  };

  return summary;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runTenPlayerSimulation()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      if (!BROADCAST) {
        console.log(
          "Dry run only. Set TYCHE_10P_SIM_BROADCAST=1 to run the real devnet simulation.",
        );
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error(stringifySimulationError(error.stack));
      }
      process.exitCode = 1;
    });
}
