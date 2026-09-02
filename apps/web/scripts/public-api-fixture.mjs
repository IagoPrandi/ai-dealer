import { createServer } from "node:http";

const wallet = "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH";
const rule = {
  compiledArtifactHash: "08".repeat(32),
  officialInterpretation: "The guess wins when all six drawn numbers are present.",
  precompilationStatus: "passed",
  proposer: wallet,
  ruleId: 1,
  sanitizedText: "Win if the submitted guess contains all six drawn numbers.",
  state: "eligible",
  title: "All six drawn numbers",
  tokenCount: 11,
  validation: { decision: "VALID", finalConfidence: 0.91, reasonCodes: ["SUPPORTED_RULE"], reasonSummary: "Rule accepted and frozen for deterministic evaluation." },
  votes: 5,
  workedExamples: [{ draw: [1, 2, 3, 4, 5, 6], guess: [1, 2, 3, 4, 5, 6], outcome: "WIN" }],
};
const round = {
  cycle: { durationHours: 2, nextDurationHours: 8, pattern: [2, 2, 8, 8], stepIndex: 1 },
  draw: { drawResult: [20, 18, 99, 69, 90, 37], randomnessSource: wallet, settleSignature: "settled-signature", status: "fulfilled" },
  election: { activeRuleId: 1, finalistRuleIds: [1], randomRuleIds: [], status: "settled", topVotedRuleIds: [1] },
  elimination: { eliminatedRuleIds: [], status: "closed", survivorRuleIds: [1] },
  pool: {
    accounting: { buckets: { alternative: { rolloverLamports: 0, totalLamports: 30_000_000 }, original: { rolloverLamports: 0, totalLamports: 30_000_000 } } },
    guesses: 2,
    indicativeSol: 0.06,
    proposals: 1,
    totalVisiblePrizePoolSol: 0.06,
  },
  rules: [rule],
  status: "completed",
  totalVotes: 5,
  turnId: 42,
  winners: { alternative: { bucketLamports: 30_000_000, individualPayoutLamports: 0, winnerCount: 0 }, original: { bucketLamports: 30_000_000, individualPayoutLamports: 0, winnerCount: 0 }, records: [], turnId: 42 },
};
const auditLog = {
  commitmentHash: "aa".repeat(32),
  createdAt: "2026-06-08T00:05:00.000Z",
  inputHash: "bb".repeat(32),
  kind: "rule.election.proof",
  logHash: "cc".repeat(32),
  outputHash: "dd".repeat(32),
  previousLogHash: null,
  publicStateRef: { key: "42", type: "rule_election" },
  reason: "The finalist set and elected rule were committed to the public hash chain.",
  result: "settled",
  ruleId: 1,
  turnId: 42,
};
const snapshot = {
  activeTurnId: 42,
  generatedAt: "2026-06-08T00:05:00.000Z",
  totals: { claims: 1, guesses: 2, proposals: 1, winnerPayoutLamports: 60_000_000 },
  trends: { topCreators: [{ creator: wallet, electedRules: 1, proposedRules: 1, rewardLamports: 2_000_000, votesReceived: 5, winnerProducingRules: 1 }] },
  turns: [{ activity: { guesses: 2, proposals: 1, totalVotes: 5 }, economy: { prizePoolLamports: 60_000_000 }, proofs: { activeRuleId: 1, auditChainHead: auditLog.logHash }, status: "completed", turnId: 42 }],
};

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3092");
  if (url.pathname === "/health") return send(response, 200, { status: "ok" });
  if (url.pathname === "/turn/active") return send(response, 200, {
    freshness: "fresh",
    globalConfig: { activeTurnId: 42, guessCutoffBps: 7500, guessSubmissionFeeLamports: "10000000", hasActiveTurn: true, nextTurnId: 43, paused: false, ruleElectionCutoffBps: 6500, ruleRemovalFeeLamports: "50000000", voteFeeLamports: "5000000" },
    globalConfigAddress: "11111111111111111111111111111111",
    observedAt: new Date().toISOString(),
    openingGate: { blockingTurnId: null, canOpen: true, code: "READY_TO_OPEN" },
    source: "rpc",
    turnState: { eliminationWindowEndTimestamp: 0, endTimestamp: Math.floor(Date.now() / 1000) + 3600, finalistCount: 1, finalistRuleIds: [1], startTimestamp: Math.floor(Date.now() / 1000) - 1800, status: "open", turnDurationSeconds: 5400, turnId: 42 },
    turnStateAddress: "11111111111111111111111111111111",
  });
  if (url.pathname === "/rounds") return send(response, 200, { activeTurnId: 42, round });
  if (url.pathname === "/rule-proposals") return send(response, 200, { proposals: [] });
  if (url.pathname === "/rule-votes") return send(response, 200, { counts: {}, votes: [] });
  if (url.pathname === "/rule-elimination-votes") return send(response, 200, { counts: {}, votes: [] });
  if (url.pathname === "/rounds/42") {
    const activeRound = url.searchParams.has("activeTurnId")
      ? { ...round, draw: null, election: null, status: "current", winners: { ...round.winners, records: [] } }
      : round;
    return send(response, 200, { round: activeRound });
  }
  const historicalRoundMatch = /^\/rounds\/(\d+)$/u.exec(url.pathname);
  if (historicalRoundMatch) {
    const turnId = Number(historicalRoundMatch[1]);
    return send(response, 200, {
      round: {
        ...round,
        draw: null,
        election: null,
        pool: { ...round.pool, guesses: 0, indicativeSol: 0, proposals: 0, totalVisiblePrizePoolSol: 0 },
        rules: [],
        status: "completed",
        totalVotes: 0,
        turnId,
      },
    });
  }
  if (url.pathname === "/transparency") return send(response, 200, { snapshot });
  if (url.pathname === "/api/v1/turns/42/rules/1") return send(response, 200, { rule: { audit: [{ kind: auditLog.kind, logHash: auditLog.logHash }], election: { active: true, finalist: true, source: "top_voted" }, elimination: { approvalVotes: 5, eliminated: false, eliminationVotes: 0, status: "survived", threshold: 6 }, rule, status: "completed", turnId: 42 } });
  if (url.pathname === `/players/${wallet}/profile`) return send(response, 200, { profile: { stats: { eliminationVotesCast: 0, guessesSubmitted: 2, rulesElected: 1, rulesProposed: 1, totalEarnedLamports: 2_000_000, votesCast: 1, votesReceived: 5, winnerProducingRules: 1 }, wallet } });
  if (url.pathname === "/audit" && url.searchParams.get("turnId") === "42") return send(response, 200, { logs: [auditLog] });
  return send(response, 404, { error: "not_found" });
}).listen(3092, "127.0.0.1", () => console.log("Public API fixture listening on http://127.0.0.1:3092"));
