/**
 * Intercepta window.fetch no modo galeria e responde os endpoints da API do
 * Tyche com dados canned. Qualquer URL desconhecida segue para o fetch real.
 *
 * Idempotente: chamar installMockFetch() mais de uma vez não empilha patches.
 */
import {
  MOCK_ACTIVE_TURN_ID,
  MOCK_CONVERSATION_DRAFTS,
  MOCK_GUESS_RECEIPT,
  MOCK_GLOBAL_CONFIG,
  MOCK_PLAYER_CLAIMS,
  MOCK_ROUND,
  MOCK_RULE_ELIMINATION_VOTES,
  MOCK_RULE_PREFLIGHT,
  MOCK_RULE_PROPOSALS,
  MOCK_TURN_STATE,
  MOCK_RULE_VOTES,
} from "./mockData";

const INSTALLED_FLAG = "__tycheMockFetchInstalled";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function resolveMock(url: string): unknown | undefined {
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
  if (url.includes("/rule-preflight")) {
    return MOCK_RULE_PREFLIGHT;
  }
  if (url.includes("/rule-proposals")) {
    return MOCK_RULE_PROPOSALS;
  }
  if (url.includes("/rule-elimination-votes")) {
    return MOCK_RULE_ELIMINATION_VOTES;
  }
  if (url.includes("/rule-votes")) {
    return MOCK_RULE_VOTES;
  }
  if (url.includes("/elimination")) {
    // Sem estado de eliminação ativo: as telas tratam isto como opcional.
    return {};
  }
  if (url.includes("/conversation-drafts")) {
    return MOCK_CONVERSATION_DRAFTS;
  }
  if (url.includes("/guess-receipts")) {
    return MOCK_GUESS_RECEIPT;
  }
  if (url.includes("/tokenomics/public")) {
    return {
      tokenomics: {
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
    return MOCK_ROUND;
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

    const mock = resolveMock(url);
    if (mock !== undefined) {
      return jsonResponse(mock);
    }
    return originalFetch(input, init);
  };
}
