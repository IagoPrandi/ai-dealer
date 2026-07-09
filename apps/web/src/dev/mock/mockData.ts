/**
 * Dados "canned" para a galeria de validação de UI (NEXT_PUBLIC_UI_MOCK=1).
 *
 * Nada aqui toca a rede: representa o estado "feliz" (rodada aberta, carteira
 * conectada, propostas existentes) que as telas precisam para mostrar o
 * conteúdo rico sem rodar a lógica de jogo nem o backend.
 */

// Endereço base58 plausível usado como carteira/proposer de exemplo.
export const MOCK_WALLET_ADDRESS = "GZRY3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7tHe";

// Turn ativo que o snapshot on-chain "falso" descreve.
export const MOCK_ACTIVE_TURN_ID = 7;

// Valores de GlobalConfig (ver decodeGlobalConfigAccount em idealerProgram.ts).
export const MOCK_GLOBAL_CONFIG = {
  activeTurnId: MOCK_ACTIVE_TURN_ID,
  guessCutoffBps: 7500,
  guessSubmissionFeeLamports: 10_000_000n,
  hasActiveTurn: true,
  nextTurnId: MOCK_ACTIVE_TURN_ID + 1,
  paused: false,
  ruleElectionCutoffBps: 6500,
  ruleRemovalFeeLamports: 50_000_000n,
  voteFeeLamports: 5_000_000n,
};

// Janela do turn: começou há 30 min, termina em 1 h (no futuro => "aberto").
export const MOCK_TURN_STATE = {
  endTimestamp: Math.floor(Date.now() / 1000) + 3600,
  startTimestamp: Math.floor(Date.now() / 1000) - 1800,
  status: "open" as const,
  turnDurationSeconds: 5400,
  turnId: MOCK_ACTIVE_TURN_ID,
};

// Resposta de GET /rule-proposals?turnId=...
export const MOCK_RULE_PROPOSALS = {
  proposals: [
    {
      proposer: "GZRYMy3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7t",
      ruleId: 1,
      ruleProposal: "B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU",
      sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
      title: "Four Numbers Match",
      tokenCount: 12,
    },
    {
      proposer: "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uvw",
      ruleId: 2,
      ruleProposal: "C2LIRicFAbYCUUNYTOWDXN7HiTBkGUFxesZ2O8EwCoaV",
      sanitizedText: "The guess with the closest sum to the drawn total wins.",
      title: "Closest Sum",
      tokenCount: 11,
    },
    {
      proposer: "D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3Xyz",
      ruleId: 3,
      ruleProposal: "E3MJSjdGBcZDVVOZUPXEYO8IjUClHVGyftA3P9FxDpbW",
      sanitizedText: "Win if all six of your numbers are even.",
      title: "All Even",
      tokenCount: 9,
    },
  ],
};

// Resposta de GET /rule-votes?turnId=... (contagens por ruleId + votos crus).
export const MOCK_RULE_VOTES = {
  counts: {
    "1": 125,
    "2": 98,
    "3": 64,
  } as Record<string, number>,
  votes: [] as Array<{ ruleId: number; signature: string; turnId: number; voter: string }>,
};

// Resposta de GET /rule-elimination-votes?turnId=... (sem eliminações no mock).
export const MOCK_RULE_ELIMINATION_VOTES = {
  counts: { "2": 22 } as Record<string, number>,
  votes: [] as Array<{ ruleId: number; signature: string; turnId: number; voter: string }>,
};

// Resposta de GET /players/{wallet}/claims — ledger de exemplo (1 prêmio disponível).
export const MOCK_PLAYER_CLAIMS = {
  claims: {
    availableLamports: 920_000_000,
    claimedLamports: 1_840_000_000,
    records: [
      {
        amountLamports: 920_000_000,
        category: "alternative" as const,
        claimId: "a".repeat(64),
        kind: "winner_payout" as const,
        status: "available" as const,
        statusReason: "READY",
        turnId: MOCK_ACTIVE_TURN_ID - 1,
      },
      {
        amountLamports: 1_840_000_000,
        category: null,
        claimId: "b".repeat(64),
        kind: "creator_reward" as const,
        status: "claimed" as const,
        statusReason: "CLAIMED",
        turnId: MOCK_ACTIVE_TURN_ID - 1,
      },
    ],
    totalLamports: 2_760_000_000,
    wallet: MOCK_WALLET_ADDRESS,
  },
};

// Resposta de POST /rule-preflight (veredito VALID => proposável).
export const MOCK_RULE_PREFLIGHT = {
  preflight: {
    addedOperationalClauses: [],
    clarityNote: "",
    compiledArtifactHash: "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c",
    decision: "VALID" as const,
    dealerMessage:
      "Clear and verifiable. Players win when at least four guessed numbers are drawn.",
    difficultyClass: "Medium",
    finalConfidence: 0.92,
    maxTokens: 1024,
    needsClarification: false,
    normalizedText:
      "Win if at least 4 of your guess numbers appear in the drawn numbers.",
    normalizedTextHash: Array.from({ length: 32 }, (_, i) => (i * 7) % 256),
    officialInterpretation: "Win when count(guess ∩ draw) >= 4.",
    officialInterpretationHash: Array.from({ length: 32 }, (_, i) => (i * 5) % 256),
    preflightResultHash: Array.from({ length: 32 }, (_, i) => (i * 3) % 256),
    reasonSummary: "Rule is measurable and unambiguous.",
    reproposalBlocked: false,
    ruleId: 4,
    ruleMode: "predicate" as const,
    sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
    sanitizedTextHash: Array.from({ length: 32 }, (_, i) => (i * 2) % 256),
    tokenCount: 12,
  },
};

// Resposta de GET /guess-receipts?turnId=...&player=...
export const MOCK_GUESS_RECEIPT = {
  receipt: {
    numbers: [5, 17, 22, 35, 64, 89],
    signature:
      "5Zx9k2QmA7bC3dE4fG6hJ8kL1mN2oP3qR4sT5uV6wX7yZ8aB9cD0eF1gH2iJ3kL4mN5",
    submittedAt: "2026-06-21T10:30:00.000Z",
  },
};

// Resposta de GET /players/{wallet}/conversation-drafts — rascunho salvo com a
// transcrição completa, para exercitar o "retomar conversa" (histórico do chat).
export const MOCK_CONVERSATION_DRAFTS = {
  drafts: [
    {
      createdAt: "2026-06-21T10:15:00.000Z",
      draftId: "draft-mock-0001",
      lastMessage:
        "Clear and verifiable. Players win when at least four guessed numbers are drawn.",
      messages: [
        {
          text: "Hey! Tell me in one sentence how your rule decides the round winner. Be creative - I turn it into a valid rule.",
          who: "ai" as const,
        },
        { text: "examples", who: "user" as const },
        {
          text: "Try one of these:\nWin if at least 4 of your numbers appear in the draw.\nWin if the sum of your numbers equals the sum of the drawn numbers.",
          who: "ai" as const,
        },
        { text: "Win if at least 4 of your numbers appear in the draw.", who: "user" as const },
        {
          text: "Clear and verifiable. Players win when at least four guessed numbers are drawn.",
          who: "ai" as const,
        },
      ],
      normalizedText:
        "Win if at least 4 of your guess numbers appear in the drawn numbers.",
      officialInterpretation: "Win when count(guess ∩ draw) >= 4.",
      prompt: "Win if at least 4 of your numbers appear in the draw.",
      ruleId: 4,
      status: "draft" as const,
      tokenCount: 12,
      turnId: MOCK_ACTIVE_TURN_ID,
      updatedAt: "2026-06-21T10:20:00.000Z",
      wallet: MOCK_WALLET_ADDRESS,
    },
  ],
};

// Resposta de GET /rounds/{turnId} (shape RoundSummary do RoundPage).
export const MOCK_ROUND = {
  round: {
    cycle: {
      durationHours: 1,
      nextDurationHours: 2,
      pattern: [1, 2, 4, 8, 16],
      stepIndex: 0,
    },
    draw: {
      drawResult: [7, 18, 23, 41, 49, 56],
      drawnAt: "2026-06-21T12:00:00.000Z",
      failureCode: null,
      randomnessAccount: "RaNDomNeSSAcc7777777777777777777777777777777",
      randomnessSource: "SwitchboardOnDemand1111111111111111111111111",
      randomnessValue: "0xa1b2c3d4e5f60718293a4b5c6d7e8f90",
      requestedAt: "2026-06-21T11:00:00.000Z",
      settleSignature:
        "4kQ8m2NpB6cD3eF5gH7iJ9kL1mN2oP3qR4sT5uV6wX7yZ8aB9cD0eF1gH2iJ3kL4mN6",
      status: "fulfilled" as const,
      turnId: MOCK_ACTIVE_TURN_ID,
    },
    election: {
      activeRuleArtifactHash: "artifacthash00000000000000000000000000000001",
      activeRuleHash: "rulehash000000000000000000000000000000000001",
      activeRuleId: 1,
      electedFinalistIndex: 0,
      eligibleRuleIds: [1, 2, 3],
      eligibleRulePoolHash: "poolhash00000000000000000000000000000000001",
      finalistRuleIds: [1, 2],
      finalistSetHash: "finalistset0000000000000000000000000000000001",
      randomFinalistHash: "randfinalist000000000000000000000000000000001",
      randomRuleIds: [3],
      randomnessAccount: "RaNDomNeSSAcc8888888888888888888888888888888",
      randomnessSource: "SwitchboardOnDemand1111111111111111111111111",
      randomnessValue: "0xf0e1d2c3b4a5968778695a4b3c2d1e0f",
      requestedAt: "2026-06-21T11:00:00.000Z",
      settledAt: "2026-06-21T11:05:00.000Z",
      status: "settled" as const,
      topVotedFinalistHash: "topvoted0000000000000000000000000000000000001",
      topVotedRuleIds: [1],
    },
    elimination: {
      closedAt: "2026-06-21T11:30:00.000Z",
      decisionWindowClosesAt: "2026-06-21T11:30:00.000Z",
      decisionWindowOpenedAt: "2026-06-21T11:00:00.000Z",
      eliminatedFinalistHash: "elim00000000000000000000000000000000000000001",
      eliminatedRuleIds: [2],
      finalists: [
        {
          approvalVotes: 50,
          eliminated: false,
          eliminationVotes: 5,
          ruleId: 1,
          status: "survived" as const,
          threshold: 20,
        },
        {
          approvalVotes: 40,
          eliminated: true,
          eliminationVotes: 22,
          ruleId: 2,
          status: "eliminated" as const,
          threshold: 20,
        },
      ],
      status: "closed" as const,
      survivorFinalistHash: "surv00000000000000000000000000000000000000001",
      survivorRuleIds: [1],
      turnId: MOCK_ACTIVE_TURN_ID,
    },
    pool: {
      accounting: {
        buckets: {
          alternative: { rolloverLamports: 0, totalLamports: 5_000_000_000 },
          original: { rolloverLamports: 0, totalLamports: 15_000_000_000 },
        },
      },
      eliminationVoteFeeSol: 0.001,
      eliminationVoteFees: 50,
      guessSol: 10.5,
      guesses: 1050,
      indicativeSol: 20.5,
      proposalSol: 2,
      proposals: 40,
    },
    activity: [
      {
        bucket: "original" as const,
        fromTurnId: MOCK_ACTIVE_TURN_ID - 1,
        rolloverLamports: 0,
        toTurnId: MOCK_ACTIVE_TURN_ID,
        type: "pool_rollover" as const,
      },
    ],
    rolloverSettlement: null,
    rules: [
      {
        compiledArtifactHash: "artifacthash00000000000000000000000000000001",
        precompilationStatus: "passed" as const,
        proposer: "GZRYMy3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7t",
        ruleId: 1,
        ruleProposal: "B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU",
        sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
        state: "eligible" as const,
        title: "Four Numbers Match",
        tokenCount: 12,
        validation: {
          decision: "VALID" as const,
          finalConfidence: 0.92,
          model: "claude-opus-4-8",
          reasonCodes: [],
          reasonSummary: "Clear and measurable.",
          validatedAt: "2026-06-21T10:00:00.000Z",
          validationLogId: "log-0001",
        },
        votes: 125,
      },
      {
        compiledArtifactHash: "artifacthash00000000000000000000000000000002",
        precompilationStatus: "passed" as const,
        proposer: "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uvw",
        ruleId: 2,
        ruleProposal: "C2LIRicFAbYCUUNYTOWDXN7HiTBkGUFxesZ2O8EwCoaV",
        sanitizedText: "The guess with the closest sum to the drawn total wins.",
        state: "invalidated" as const,
        title: "Closest Sum",
        tokenCount: 11,
        validation: {
          decision: "VALID" as const,
          finalConfidence: 0.81,
          model: "claude-opus-4-8",
          reasonCodes: [],
          reasonSummary: "Eliminated by community vote.",
          validatedAt: "2026-06-21T10:02:00.000Z",
          validationLogId: "log-0002",
        },
        votes: 98,
      },
    ],
    status: "completed" as const,
    totalVotes: 287,
    turnId: MOCK_ACTIVE_TURN_ID,
  },
};
