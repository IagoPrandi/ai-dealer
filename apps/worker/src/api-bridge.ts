import { createHash } from "node:crypto";
import type { RuleAst } from "@tyche/rule-schema";
import type { PublishedDraw } from "./draw.js";
import type { PublishedRuleElection } from "./election.js";
import {
  type FrozenRuleArtifact,
  type GuessVerificationJob,
  type GuessVerificationResult,
  verifyGuessJob,
} from "./guess-verification.js";

/**
 * Worker -> API projection bridge (M5.3). The on-chain program is the source of
 * truth for randomness/draw/election; this module pushes the worker's verified
 * projections to the existing API endpoints so the read-side (Result/Rewards
 * screens via `GET /rounds/{turnId}`) populates from real settled data, and
 * records each settlement state-machine transition into the M3.7 hash-chained
 * audit log. Every call is idempotent on the API side, so a retried settlement
 * cycle never double-projects or double-pays.
 */

export interface ApiBridgeConfig {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface SettlementTransitionInput {
  fromState: string;
  idempotencyKey: string;
  inputHash: string;
  outputHash: string;
  recordedAt?: string;
  signature?: string | null;
  toState: string;
  transitionReason: string;
  turnId: number;
}

// Shapes the API returns for the endpoints the bridge consumes. Only the fields
// the worker needs are modeled.
interface ApiCompiledArtifact {
  ast: RuleAst;
  normalizedText: string;
  promptContractVersion: string;
  schemaVersion: 1 | 2;
}

interface ApiVerificationJobRecord {
  activeRuleArtifact: ApiCompiledArtifact | null;
  activeRuleId: number | null;
  attempts: number;
  draw: number[];
  id: string;
  maxAttempts: number;
  payload: {
    compiled_artifact_hash?: string;
    draw_hash: string;
    guess_hash: string;
    guess_sequence: string;
    turn_id: string;
    wallet: string;
  };
  playerGuess: number[];
  runAfter: string;
  status: string;
}

export interface VerificationProjectionResult {
  failed: { jobId: string; reason: string }[];
  posted: number;
  turnId: number;
}

/**
 * Elimination decision-window projection (PRD §6.12). Published when the
 * finalist VRF settles (window opens on-chain) and again when
 * `close_elimination_window` lands, so the read side can surface the shortlist
 * voting phase with its real on-chain start/end timestamps.
 */
export interface PublishedRuleElimination {
  closedAt: string | null;
  decisionWindowClosesAt: string;
  decisionWindowOpenedAt: string;
  eliminatedFinalistHash: string | null;
  eliminatedRuleIds: number[];
  finalistRuleIds: number[];
  status: "closed" | "open";
  survivorFinalistHash: string | null;
  survivorRuleIds: number[];
  turnId: number;
}

export class ApiBridge {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ApiBridgeConfig) {
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async publishDraw(draw: PublishedDraw): Promise<void> {
    await this.post("/draws", draw);
  }

  async publishElection(election: PublishedRuleElection): Promise<void> {
    await this.post("/elections", election);
  }

  async publishRuleElimination(
    elimination: PublishedRuleElimination,
  ): Promise<void> {
    await this.post("/rule-eliminations", elimination);
  }

  /** Create the per-guess verification jobs for a fulfilled draw. */
  async createVerificationJobs(turnId: number): Promise<void> {
    await this.post("/verification-jobs/create-turn", { turnId });
  }

  /**
   * Verify every still-pending guess job locally (deterministic, no I/O) and
   * project the result. `saveGuessVerificationResult` on the API recomputes
   * winners and rewards, so the read side is consistent after this returns.
   * A job that cannot be verified (e.g. missing/forged artifact) is surfaced,
   * never silently dropped.
   */
  async projectVerificationResults(
    turnId: number,
    nowIso: () => string = () => new Date().toISOString(),
  ): Promise<VerificationProjectionResult> {
    const response = await this.get<{ jobs: ApiVerificationJobRecord[] }>(
      `/verification-jobs?turnId=${turnId}`,
    );
    const pending = response.jobs.filter(
      (job) => job.status === "pending" || job.status === "retry_scheduled",
    );

    let posted = 0;
    const failed: { jobId: string; reason: string }[] = [];
    for (const record of pending) {
      try {
        const result = verifyGuessJob(toWorkerJob(record), nowIso());
        await this.post("/verification-results", toApiResult(result));
        posted += 1;
      } catch (error) {
        failed.push({
          jobId: record.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { failed, posted, turnId };
  }

  async calculateWinners(turnId: number): Promise<void> {
    await this.post("/winner-records/calculate-turn", { turnId });
  }

  async calculateRewards(turnId: number): Promise<void> {
    await this.post("/reward-records/calculate-turn", { turnId });
  }

  /**
   * Settle the turn's prize-pool rollover: each bucket's unallocated remainder
   * (the FULL bucket when it had no winner, integer-division dust otherwise)
   * is recorded as the next turn's inbound rollover, so a no-winner prize
   * accumulates across turns (PRD §8). Must run after `calculateWinners`.
   */
  async settleTurnRollover(turnId: number): Promise<void> {
    await this.post("/turn-rollovers/settle", { turnId });
  }

  async createClaims(turnId: number, availableAt?: string): Promise<void> {
    await this.post("/claim-records/create-turn", {
      turnId,
      ...(availableAt ? { availableAt } : {}),
    });
  }

  async recordSettlementTransition(
    input: SettlementTransitionInput,
  ): Promise<void> {
    await this.post("/settlement-transitions", input);
  }

  /** The set of §5.5 `toState`s already recorded for a turn (drives idempotent
   * sequencing of the off-chain projection steps). */
  async fetchRecordedStates(turnId: number): Promise<Set<string>> {
    const response = await this.get<{
      transitions: { toState: string }[];
    }>(`/settlement-transitions?turnId=${turnId}`);
    return new Set(response.transitions.map((transition) => transition.toState));
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `POST ${path} returned HTTP ${response.status}: ${await safeText(response)}`,
      );
    }
    return response.json();
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(
        `GET ${path} returned HTTP ${response.status}: ${await safeText(response)}`,
      );
    }
    return (await response.json()) as T;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "<no body>";
  }
}

function toWorkerJob(record: ApiVerificationJobRecord): GuessVerificationJob {
  const activeRuleArtifact: FrozenRuleArtifact | null =
    record.activeRuleArtifact && record.activeRuleId !== null
      ? {
          ast: record.activeRuleArtifact.ast,
          compiledArtifactHash: record.payload.compiled_artifact_hash ?? "",
          normalizedText: record.activeRuleArtifact.normalizedText,
          promptContractVersion: record.activeRuleArtifact.promptContractVersion,
          ruleId: record.activeRuleId,
          schemaVersion: record.activeRuleArtifact.schemaVersion,
        }
      : null;

  return {
    activeRuleArtifact,
    attempts: record.attempts,
    draw: record.draw,
    id: record.id,
    maxAttempts: record.maxAttempts,
    payload: record.payload,
    playerGuess: record.playerGuess,
    runAfter: record.runAfter,
    status: "pending",
  };
}

function toApiResult(result: GuessVerificationResult) {
  // The API requires a 32-byte hex `resultId`; derive it deterministically from
  // (turn, player, guess sequence) so re-posting the same result is idempotent.
  const resultId = createHash("sha256")
    .update(`${result.turnId}:${result.player}:${result.sequence}`, "utf8")
    .digest("hex");
  return { ...result, resultId };
}
