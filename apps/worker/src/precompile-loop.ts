import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { createPrecompileRuleInstruction } from "./devnet-seed-real-inputs.js";
import {
  createTurnAutomationConfig,
  fetchGlobalConfig,
  fetchTurnState,
  stringifySimulationError,
  type TurnAutomationConfig,
} from "./turn-automation.js";

/**
 * Rule precompilation loop (PRD §7.9 / §6.6 "background precompilation").
 *
 * A rule submitted through the app is written on-chain as `RuleProposal` in the
 * `Proposed` state with `Precompilation::Pending`. Before it can be an election
 * candidate the turn authority must record its compiled artifact on-chain via
 * `precompile_rule`, flipping the rule to `Eligible` + `Precompilation::Passed`
 * (or `Invalidated` + `Failed`). Without this step every turn with real user
 * rules falls to the original-only path (PRD §6.12) because
 * `eligible_rule_pool` is always empty.
 *
 * This loop runs continuously while phase 1 is open (before the on-chain
 * `rule_election_cutoff_bps`), mirroring the turn/settlement loops: env-gated and
 * OFF by default. It calls the API's validation endpoint
 * (`/rule-validations/run`, which freezes the artifact the rule was compiled to
 * during preflight, stores it, and projects the read-side `eligible` state) and
 * the same authority-signed `precompile_rule` instruction the devnet seed
 * operator uses — no mocks, no fallbacks. The on-chain artifact hash is the one
 * the API returns for the stored validation, so on-chain state, the frozen
 * election hash, the artifact the player paid for, and the artifact settlement
 * executes all reconcile.
 */

const DEFAULT_API_BASE_URL = "http://localhost:3002";
const DEFAULT_INTERVAL_MS = 15_000;
const COMMITMENT: Commitment = "confirmed";
const BASIS_POINTS_DENOMINATOR = 10_000;

export interface PrecompileLoopConfig {
  apiBaseUrl: string;
  automation: TurnAutomationConfig;
  enabled: boolean;
  intervalMs: number;
}

interface ApiRuleProposal {
  compiledArtifactHash: string | null;
  precompilationStatus: "failed" | "passed" | "pending";
  ruleId: number;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed" | "removed_paid";
  tokenCount: number;
}

interface ApiValidationResult {
  compiledArtifactHash: string | null;
  decision: "INVALID" | "VALID";
}

export type PrecompileLoopResult =
  | {
      action: "precompiled";
      /** Rules whose validation call failed; the pass continues past them. */
      failed: { reason: string; ruleId: number }[];
      precompiled: { decision: string; ruleId: number; signature: string }[];
      turnId: number;
    }
  | {
      action:
        | "cutoff_passed"
        | "disabled"
        | "no_active_turn"
        | "no_pending_rules"
        | "paused";
      turnId?: number;
    };

export interface OpenTurnPhase1 {
  cutoffTimestamp: number;
  turnId: number;
}

export interface PrecompileLoopDeps {
  /**
   * Resolve the open turn + its phase-1 cutoff, or a paused/no-turn state.
   * Reads on-chain in production; injected in tests.
   */
  resolveTurn: () => Promise<
    { paused: true } | { paused: false; turn: OpenTurnPhase1 | null }
  >;
  /** POST /rule-validations/run — freeze the paid artifact, store, project. */
  runValidation: (
    turnId: number,
    ruleId: number,
  ) => Promise<ApiValidationResult>;
  /** GET /rule-proposals?turnId — the turn's projected proposals. */
  fetchProposals: (turnId: number) => Promise<ApiRuleProposal[]>;
  /** Send the authority-signed on-chain `precompile_rule`; resolves to sig. */
  sendPrecompile: (input: {
    compiledArtifactHash: string;
    passed: boolean;
    ruleId: number;
    turnId: number;
  }) => Promise<string>;
  nowSeconds: () => number;
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

export async function createPrecompileLoopConfig(
  env = process.env,
): Promise<PrecompileLoopConfig> {
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    automation: await createTurnAutomationConfig(env),
    enabled: envFlag(env.TYCHE_RULE_PRECOMPILE_ENABLED),
    intervalMs: envNumber(
      env.TYCHE_RULE_PRECOMPILE_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
    ),
  };
}

/**
 * Build the loop dependencies from the resolved config. The API calls use the
 * global `fetch`; the on-chain send reuses the seed operator's tested
 * `precompile_rule` instruction builder and signs with the turn authority.
 */
export function createPrecompileLoopDeps(
  config: PrecompileLoopConfig,
): PrecompileLoopDeps {
  const apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, "");
  const authorityBytes = config.automation.authorityKeypairBytes;
  const programId = new PublicKey(config.automation.programId.toString());
  const connection = new Connection(config.automation.rpcUrl, COMMITMENT);

  return {
    resolveTurn: () => resolveOpenTurn(config),
    fetchProposals: async (turnId) => {
      const response = await fetch(
        `${apiBaseUrl}/rule-proposals?turnId=${turnId}`,
      );
      if (!response.ok) {
        throw new Error(
          `GET /rule-proposals returned HTTP ${response.status}`,
        );
      }
      const body = (await response.json()) as { proposals?: ApiRuleProposal[] };
      return body.proposals ?? [];
    },
    nowSeconds: () => Math.floor(Date.now() / 1_000),
    runValidation: async (turnId, ruleId) => {
      const response = await fetch(`${apiBaseUrl}/rule-validations/run`, {
        body: JSON.stringify({ ruleId, turnId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        validation?: ApiValidationResult;
      } | null;
      if (!response.ok || !body?.validation) {
        throw new Error(
          `POST /rule-validations/run returned HTTP ${response.status}: ${JSON.stringify(
            body,
          )}`,
        );
      }
      return body.validation;
    },
    sendPrecompile: async ({ compiledArtifactHash, passed, ruleId, turnId }) => {
      if (!authorityBytes) {
        throw new Error(
          "Rule precompilation requires TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH.",
        );
      }
      const authority = Keypair.fromSecretKey(authorityBytes);
      const instruction = createPrecompileRuleInstruction({
        authority: authority.publicKey,
        compiledArtifactHash: Buffer.from(compiledArtifactHash, "hex"),
        programId,
        ruleId,
        turnId,
      });
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash(COMMITMENT);
      const message = new TransactionMessage({
        instructions: [
          {
            data: instruction.data,
            keys: instruction.keys,
            programId: instruction.programId,
          },
        ],
        payerKey: authority.publicKey,
        recentBlockhash: blockhash,
      }).compileToV0Message();
      const transaction = new VersionedTransaction(message);
      transaction.sign([authority]);

      const simulation = await connection.simulateTransaction(transaction, {
        commitment: COMMITMENT,
        sigVerify: true,
      });
      if (simulation.value.err) {
        throw new Error(
          `precompile_rule:${ruleId} simulation failed: ${stringifySimulationError(
            simulation.value.err,
          )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
        );
      }
      void passed;
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 3,
        preflightCommitment: COMMITMENT,
        skipPreflight: false,
      });
      const confirmation = await connection.confirmTransaction(
        { blockhash, lastValidBlockHeight, signature },
        COMMITMENT,
      );
      if (confirmation.value.err) {
        throw new Error(
          `precompile_rule:${ruleId} ${signature} failed after send: ${stringifySimulationError(
            confirmation.value.err,
          )}`,
        );
      }
      return signature;
    },
  };
}

/**
 * Resolve the currently open turn and its phase-1 (rule-election) cutoff. Returns
 * `null` when there is no open turn to precompile for.
 */
async function resolveOpenTurn(config: PrecompileLoopConfig) {
  const rpc = createSolanaRpc(config.automation.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.automation.programId,
    rpc,
  });
  if (globalConfig.snapshot.paused) {
    return { paused: true as const };
  }
  if (
    !globalConfig.snapshot.hasActiveTurn ||
    globalConfig.snapshot.activeTurnId <= 0
  ) {
    return { paused: false as const, turn: null };
  }

  const turnId = globalConfig.snapshot.activeTurnId;
  const turn = await fetchTurnState({
    programId: config.automation.programId,
    rpc,
    turnId,
  });
  if (turn.snapshot.status !== "open") {
    return { paused: false as const, turn: null };
  }

  const duration =
    turn.snapshot.endTimestamp - turn.snapshot.startTimestamp;
  const cutoffTimestamp =
    turn.snapshot.startTimestamp +
    Math.round(
      (duration * globalConfig.snapshot.ruleElectionCutoffBps) /
        BASIS_POINTS_DENOMINATOR,
    );
  return {
    paused: false as const,
    turn: { cutoffTimestamp, turnId },
  };
}

/**
 * One precompilation pass: validate + precompile every still-`proposed` rule of
 * the open turn while phase 1 is open. Idempotent — a rule already `eligible`/
 * `invalidated` (state moved) is skipped, so a retried pass never re-sends.
 */
export async function runPrecompileLoopOnce(
  config: PrecompileLoopConfig,
  deps: PrecompileLoopDeps = createPrecompileLoopDeps(config),
): Promise<PrecompileLoopResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes) {
    throw new Error(
      "Rule precompilation is enabled but TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
    );
  }

  const resolved = await deps.resolveTurn();
  if (resolved.paused) {
    return { action: "paused" };
  }
  if (!resolved.turn) {
    return { action: "no_active_turn" };
  }

  const { cutoffTimestamp, turnId } = resolved.turn;
  // `precompile_rule` is a phase-1 action the program rejects once the cutoff is
  // reached; do not attempt sends the chain would reject.
  if (deps.nowSeconds() >= cutoffTimestamp) {
    return { action: "cutoff_passed", turnId };
  }

  const proposals = await deps.fetchProposals(turnId);
  const pending = proposals.filter(
    (proposal) =>
      proposal.state === "proposed" &&
      proposal.precompilationStatus === "pending",
  );
  if (pending.length === 0) {
    return { action: "no_pending_rules", turnId };
  }

  const precompiled: { decision: string; ruleId: number; signature: string }[] =
    [];
  const failed: { reason: string; ruleId: number }[] = [];
  for (const proposal of pending) {
    // Re-check the cutoff before each send: compilation of an earlier rule can
    // push us past the phase-1 boundary mid-pass.
    if (deps.nowSeconds() >= cutoffTimestamp) {
      break;
    }
    let validation;
    try {
      validation = await deps.runValidation(turnId, proposal.ruleId);
    } catch (error) {
      // One rule the API cannot validate — an artifact it can no longer resolve
      // — must not stop the turn's other rules from being precompiled. The rule
      // stays `proposed`/`pending`, so a later pass retries it and it never
      // enters the election on an artifact nobody paid for.
      failed.push({
        reason: error instanceof Error ? error.message : String(error),
        ruleId: proposal.ruleId,
      });
      continue;
    }
    if (validation.decision !== "VALID" || !validation.compiledArtifactHash) {
      // The API already projected the rule to `invalidated`; there is no valid
      // artifact to commit on-chain, so it is correctly excluded from election.
      continue;
    }
    const signature = await deps.sendPrecompile({
      compiledArtifactHash: validation.compiledArtifactHash,
      passed: true,
      ruleId: proposal.ruleId,
      turnId,
    });
    precompiled.push({
      decision: validation.decision,
      ruleId: proposal.ruleId,
      signature,
    });
  }

  return { action: "precompiled", failed, precompiled, turnId };
}

export function startPrecompileLoop(config: PrecompileLoopConfig) {
  if (!config.enabled) {
    return null;
  }

  const deps = createPrecompileLoopDeps(config);
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await runPrecompileLoopOnce(config, deps);
      if (result.action === "precompiled") {
        for (const entry of result.precompiled) {
          console.log(
            `precompile turn=${result.turnId} rule=${entry.ruleId} signature=${entry.signature}`,
          );
        }
        for (const entry of result.failed) {
          console.error(
            `precompile turn=${result.turnId} rule=${entry.ruleId} validation failed: ${entry.reason}`,
          );
        }
      }
    } catch (error) {
      console.error("rule precompile loop failed", error);
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, config.intervalMs);
}
