import { createHash } from "node:crypto";

export type ElectionAction = "lock" | "none" | "request" | "settle" | "wait";

export interface ElectionCandidate {
  compiledArtifactHash: string;
  createdAtSeconds: number;
  isEligibleState: boolean;
  isPrecompiledValid: boolean;
  reportCount: number;
  ruleId: number;
  sanitizedTextHash: string;
  voteCount: number;
}

export interface RuleElectionConfig {
  randomFinalistCount: number;
  topVotedFinalistCount: number;
}

export interface RuleElectionResult {
  activeRuleId: number | null;
  activeRuleArtifactHash: string | null;
  activeRuleHash: string | null;
  electedFinalistIndex: number;
  eligibleRuleIds: number[];
  eligibleRulePoolHash: string;
  finalistRuleIds: number[];
  finalistSetHash: string;
  randomFinalistHash: string;
  randomRuleIds: number[];
  topVotedFinalistHash: string;
  topVotedRuleIds: number[];
}

export interface ElectionTurn {
  activeRuleId: number | null;
  electionVrfRequest: string | null;
  eligibleRulePoolHash: string | null;
  electionCutoffTimestampSeconds: number;
  turnId: number;
}

export type ElectionRandomnessState =
  | { status: "failed" }
  | { status: "pending" }
  | { randomness: Uint8Array; source: string; status: "ready" };

export interface PublishedRuleElection extends RuleElectionResult {
  randomnessAccount: string | null;
  randomnessSource: string | null;
  randomnessValue: string | null;
  requestedAt: string | null;
  settledAt: string | null;
  status: "locked" | "original_only" | "requested" | "settled";
  turnId: number;
}

const U64_MAX = (1n << 64n) - 1n;
const ZERO_HASH = "00".repeat(32);

function assertHex32(value: string, label: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }
}

function digest(input: Buffer) {
  return createHash("sha256").update(input).digest();
}

function writeU64(value: number | bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function writeI64(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return buffer;
}

function hashRuleIds(domain: string, ruleIds: number[]) {
  const parts = [Buffer.from(domain), writeU64(ruleIds.length)];
  for (const ruleId of ruleIds) {
    parts.push(writeU64(ruleId));
  }
  return digest(Buffer.concat(parts)).toString("hex");
}

function hashCandidates(domain: string, candidates: ElectionCandidate[]) {
  const parts = [Buffer.from(domain), writeU64(candidates.length)];
  for (const candidate of candidates) {
    parts.push(writeU64(candidate.ruleId));
    const voteCount = Buffer.alloc(4);
    voteCount.writeUInt32LE(candidate.voteCount);
    parts.push(voteCount);
    parts.push(writeI64(candidate.createdAtSeconds));
    parts.push(Buffer.from(candidate.sanitizedTextHash, "hex"));
    parts.push(Buffer.from(candidate.compiledArtifactHash, "hex"));
  }
  return digest(Buffer.concat(parts)).toString("hex");
}

function isEligibleCandidate(candidate: ElectionCandidate) {
  assertHex32(candidate.sanitizedTextHash, "sanitizedTextHash");
  assertHex32(candidate.compiledArtifactHash, "compiledArtifactHash");
  return (
    candidate.isEligibleState &&
    candidate.isPrecompiledValid &&
    candidate.compiledArtifactHash.toLowerCase() !== ZERO_HASH &&
    candidate.reportCount === 0
  );
}

function deriveIndexWithCounter(
  randomness: Uint8Array,
  turnId: number,
  domain: string,
  upperBound: number,
  initialCounter: bigint,
) {
  if (randomness.length !== 32) {
    throw new Error("Election randomness must be exactly 32 bytes.");
  }
  if (upperBound <= 0) {
    throw new Error("upperBound must be positive.");
  }

  const upperBoundBigInt = BigInt(upperBound);
  const rejectionLimit = U64_MAX - (U64_MAX % upperBoundBigInt);
  let counter = initialCounter;

  for (;;) {
    const input = Buffer.concat([
      Buffer.from(randomness),
      writeU64(turnId),
      writeU64(counter),
      Buffer.from(domain),
    ]);
    const bytes = digest(input);
    for (let offset = 0; offset < bytes.length; offset += 8) {
      const value = bytes.readBigUInt64LE(offset);
      if (value < rejectionLimit) {
        return Number(value % upperBoundBigInt);
      }
    }
    counter = BigInt.asUintN(64, counter + 1n);
  }
}

function deriveUniqueIndices(
  randomness: Uint8Array,
  turnId: number,
  domain: string,
  startIndex: number,
  upperBound: number,
  count: number,
) {
  const selected: number[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < Math.min(startIndex, upperBound); index += 1) {
    seen.add(index);
  }

  let counter = 0n;
  while (selected.length < count) {
    const index = deriveIndexWithCounter(
      randomness,
      turnId,
      domain,
      upperBound,
      counter,
    );
    if (!seen.has(index)) {
      seen.add(index);
      selected.push(index);
    }
    counter += 1n;
  }

  return selected;
}

export function planRuleElectionAction(
  turn: ElectionTurn,
  nowSeconds: number,
  randomness: ElectionRandomnessState | null,
): ElectionAction {
  if (turn.activeRuleId !== null) {
    return "none";
  }
  if (nowSeconds < turn.electionCutoffTimestampSeconds) {
    return "none";
  }
  if (!turn.eligibleRulePoolHash) {
    return "lock";
  }
  if (!turn.electionVrfRequest) {
    return "request";
  }
  if (!randomness || randomness.status === "pending") {
    return "wait";
  }
  if (randomness.status === "failed") {
    return "none";
  }
  return "settle";
}

export function runRuleElection(
  candidates: ElectionCandidate[],
  randomness: Uint8Array,
  turnId: number,
  config: RuleElectionConfig,
): RuleElectionResult {
  if (randomness.length !== 32 || randomness.every((byte) => byte === 0)) {
    throw new Error("Election randomness must be a non-zero 32-byte value.");
  }

  const eligible = candidates
    .filter(isEligibleCandidate)
    .sort(
      (left, right) =>
        right.voteCount - left.voteCount ||
        left.createdAtSeconds - right.createdAtSeconds ||
        left.ruleId - right.ruleId,
    );

  const ruleIds = new Set<number>();
  for (const candidate of eligible) {
    if (ruleIds.has(candidate.ruleId)) {
      throw new Error("Duplicate eligible election candidate.");
    }
    ruleIds.add(candidate.ruleId);
  }

  const finalistTarget =
    config.topVotedFinalistCount + config.randomFinalistCount;
  if (finalistTarget <= 0) {
    throw new Error("At least one finalist slot is required.");
  }

  const eligibleRuleIds = eligible.map((candidate) => candidate.ruleId);
  const eligibleRulePoolHash = hashCandidates("eligible_pool_v1", eligible);
  const emptyHash = hashRuleIds("finalist_set_v1", []);

  if (eligible.length === 0) {
    return {
      activeRuleArtifactHash: null,
      activeRuleHash: null,
      activeRuleId: null,
      electedFinalistIndex: 0,
      eligibleRuleIds,
      eligibleRulePoolHash,
      finalistRuleIds: [],
      finalistSetHash: emptyHash,
      randomFinalistHash: hashRuleIds("random_finalists_v1", []),
      randomRuleIds: [],
      topVotedFinalistHash: hashRuleIds("top_finalists_v1", []),
      topVotedRuleIds: [],
    };
  }

  const topCount = Math.min(config.topVotedFinalistCount, eligible.length);
  const finalists = eligible.slice(0, topCount);
  const topVotedRuleIds = finalists.map((candidate) => candidate.ruleId);
  const randomRuleIds: number[] = [];

  if (eligible.length > finalistTarget) {
    const neededRandom = Math.min(
      config.randomFinalistCount,
      finalistTarget - topCount,
    );
    for (const index of deriveUniqueIndices(
      randomness,
      turnId,
      "random_finalists_v1",
      topCount,
      eligible.length,
      neededRandom,
    )) {
      const candidate = eligible[index];
      if (!candidate) {
        throw new Error("Random finalist index out of range.");
      }
      finalists.push(candidate);
      randomRuleIds.push(candidate.ruleId);
    }
  } else {
    for (const candidate of eligible.slice(topCount)) {
      finalists.push(candidate);
      randomRuleIds.push(candidate.ruleId);
    }
  }

  const electedFinalistIndex = deriveIndexWithCounter(
    randomness,
    turnId,
    "active_finalist_v1",
    finalists.length,
    0n,
  );
  const active = finalists[electedFinalistIndex];
  if (!active) {
    throw new Error("Elected finalist index out of range.");
  }

  const finalistRuleIds = finalists.map((candidate) => candidate.ruleId);

  return {
    activeRuleArtifactHash: active.compiledArtifactHash,
    activeRuleHash: active.sanitizedTextHash,
    activeRuleId: active.ruleId,
    electedFinalistIndex,
    eligibleRuleIds,
    eligibleRulePoolHash,
    finalistRuleIds,
    finalistSetHash: hashRuleIds("finalist_set_v1", finalistRuleIds),
    randomFinalistHash: hashRuleIds("random_finalists_v1", randomRuleIds),
    randomRuleIds,
    topVotedFinalistHash: hashRuleIds("top_finalists_v1", topVotedRuleIds),
    topVotedRuleIds,
  };
}

export interface RuleElectionCycleDeps {
  fetchCandidates: (turnId: number) => Promise<ElectionCandidate[]>;
  fetchRandomness: (turnId: number) => Promise<ElectionRandomnessState | null>;
  fetchTurn: (turnId: number) => Promise<ElectionTurn | null>;
  lockEligiblePool: (turnId: number, candidates: ElectionCandidate[]) => Promise<void>;
  nowIso: () => string;
  nowSeconds: () => number;
  publishElection: (election: PublishedRuleElection) => Promise<void>;
  randomnessAccountFor: (turnId: number) => Promise<string>;
  requestElectionVrf: (turnId: number, randomnessAccount: string) => Promise<void>;
  settleElection: (
    turnId: number,
    randomness: Uint8Array,
    source: string,
    candidates: ElectionCandidate[],
  ) => Promise<void>;
}

export async function runRuleElectionCycle(
  turnId: number,
  config: RuleElectionConfig,
  deps: RuleElectionCycleDeps,
) {
  const turn = await deps.fetchTurn(turnId);
  if (!turn) {
    return { action: "none" as ElectionAction, turnId };
  }

  const randomness = await deps.fetchRandomness(turnId);
  const action = planRuleElectionAction(turn, deps.nowSeconds(), randomness);

  if (action === "lock") {
    const candidates = await deps.fetchCandidates(turnId);
    const result = runRuleElection(candidates, new Uint8Array(32).fill(1), turnId, config);
    await deps.lockEligiblePool(turnId, candidates);
    await deps.publishElection({
      ...result,
      randomnessAccount: null,
      randomnessSource: null,
      randomnessValue: null,
      requestedAt: null,
      settledAt: null,
      status: result.activeRuleId === null ? "original_only" : "locked",
      turnId,
    });
    return { action, turnId };
  }

  if (action === "request") {
    const randomnessAccount = await deps.randomnessAccountFor(turnId);
    await deps.requestElectionVrf(turnId, randomnessAccount);
    return { action, turnId };
  }

  if (action === "settle" && randomness?.status === "ready") {
    const candidates = await deps.fetchCandidates(turnId);
    const result = runRuleElection(candidates, randomness.randomness, turnId, config);
    await deps.settleElection(turnId, randomness.randomness, randomness.source, candidates);
    await deps.publishElection({
      ...result,
      randomnessAccount: turn.electionVrfRequest,
      randomnessSource: randomness.source,
      randomnessValue: Buffer.from(randomness.randomness).toString("hex"),
      requestedAt: null,
      settledAt: deps.nowIso(),
      status: result.activeRuleId === null ? "original_only" : "settled",
      turnId,
    });
    return { action, turnId, activeRuleId: result.activeRuleId };
  }

  return { action, turnId };
}
