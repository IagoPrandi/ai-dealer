/**
 * Intercepta window.fetch no modo galeria e responde os endpoints da API do
 * Tyche com dados canned. Qualquer URL desconhecida segue para o fetch real.
 *
 * Idempotente: chamar installMockFetch() mais de uma vez não empilha patches.
 */
import {
  MOCK_ACTIVE_TURN_ID,
  MOCK_GUESS_RECEIPT,
  MOCK_GLOBAL_CONFIG,
  MOCK_PLAYER_CLAIMS,
  MOCK_ROUND,
  MOCK_RULE_ELIMINATION_VOTES,
  MOCK_RULE_PROPOSALS,
  MOCK_TURN_STATE,
  MOCK_RULE_VOTES,
} from "./mockData";

const INSTALLED_FLAG = "__tycheMockFetchInstalled";
const DATA_OVERRIDES_KEY = "__tycheMockDataOverrides";

interface MockDataOverrides {
  guessReceipt?: unknown;
  round?: unknown;
  ruleVotes?: {
    counts: Record<string, number>;
    votes: Array<Record<string, unknown>>;
  };
}

function dataOverrides(): MockDataOverrides | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as unknown as Record<string, unknown>)[DATA_OVERRIDES_KEY] as
    | MockDataOverrides
    | undefined;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function resolveMock(url: string): unknown | undefined {
  const overrides = dataOverrides();
  // Conversation drafts, dealer chat, and rule preflight deliberately pass
  // through to the real API. The gallery still mocks wallet, turn, and visual
  // data, while the entire authoring pipeline preserves saved context, asks for
  // interpretation approval, and generates an artifact only after approval.
  // Ordem importa: rotas mais específicas primeiro.
  if (url.includes("/turn/active")) {
    return {
      globalConfig: {
        activeTurnId: MOCK_GLOBAL_CONFIG.activeTurnId,
        guessCutoffBps: MOCK_GLOBAL_CONFIG.guessCutoffBps,
        guessSubmissionFeeLamports: String(MOCK_GLOBAL_CONFIG.guessSubmissionFeeLamports),
        hasActiveTurn: MOCK_GLOBAL_CONFIG.hasActiveTurn,
        nextTurnId: MOCK_GLOBAL_CONFIG.nextTurnId,
        paused: MOCK_GLOBAL_CONFIG.paused,
        ruleElectionCutoffBps: MOCK_GLOBAL_CONFIG.ruleElectionCutoffBps,
        ruleRemovalFeeLamports: String(MOCK_GLOBAL_CONFIG.ruleRemovalFeeLamports),
        voteFeeLamports: String(MOCK_GLOBAL_CONFIG.voteFeeLamports),
      },
      globalConfigAddress: "EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob",
      openingGate: {
        blockingTurnId: null,
        canOpen: true,
        code: "READY_TO_OPEN",
      },
      turnState: {
        ...MOCK_TURN_STATE,
        endTimestamp: Math.floor(Date.now() / 1000) + 3600,
        startTimestamp: Math.floor(Date.now() / 1000) - 1800,
        turnId: MOCK_ACTIVE_TURN_ID,
      },
      turnStateAddress: "8xUJHW97K55qCMPNv6kaRMaiRnnkKFKhJKYDZKhsMk3R",
    };
  }
  if (url.includes("/rule-proposals")) {
    return MOCK_RULE_PROPOSALS;
  }
  if (url.includes("/rule-elimination-votes")) {
    return MOCK_RULE_ELIMINATION_VOTES;
  }
  if (url.includes("/rule-votes")) {
    return overrides?.ruleVotes ?? MOCK_RULE_VOTES;
  }
  if (url.includes("/elimination")) {
    // Sem estado de eliminação ativo: as telas tratam isto como opcional.
    return {};
  }
  if (url.includes("/guess-receipts")) {
    return overrides?.guessReceipt ?? MOCK_GUESS_RECEIPT;
  }
  if (url.includes("/tokenomics/public")) {
    return {
      tokenomics: {
        accruedTreasuryFeesLamports: "0",
        available: false,
        projection: null,
        reason: "not_indexed",
      },
    };
  }
  if (url.includes("/tokenomics/wallets/")) {
    return { wallet: null };
  }
  if (url.includes("/claims")) {
    return MOCK_PLAYER_CLAIMS;
  }
  if (url.includes("/rounds/")) {
    return overrides?.round ?? MOCK_ROUND;
  }
  return undefined;
}

export function installMockFetch(): void {
  if (typeof window === "undefined") {
    return;
  }
  const flagged = window as unknown as Record<string, unknown>;
  if (flagged[INSTALLED_FLAG]) {
    return;
  }
  flagged[INSTALLED_FLAG] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const overrides = dataOverrides();
    if (method === "POST" && url.includes("/rule-votes") && overrides?.ruleVotes) {
      const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
      const vote = typeof rawBody === "string" ? JSON.parse(rawBody) as Record<string, unknown> : {};
      const ruleId = String(vote.ruleId ?? "");
      overrides.ruleVotes.counts[ruleId] = (overrides.ruleVotes.counts[ruleId] ?? 0) + 1;
      overrides.ruleVotes.votes.push(vote);
      return jsonResponse({ vote });
    }

    const mock = resolveMock(url);
    if (mock !== undefined) {
      return jsonResponse(mock);
    }
    return originalFetch(input, init);
  };
}
