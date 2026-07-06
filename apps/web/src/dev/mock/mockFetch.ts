/**
 * Intercepta window.fetch no modo galeria e responde os endpoints da API do
 * Idealer com dados canned. Qualquer URL desconhecida segue para o fetch real.
 *
 * Idempotente: chamar installMockFetch() mais de uma vez não empilha patches.
 */
import {
  MOCK_CONVERSATION_DRAFTS,
  MOCK_GUESS_RECEIPT,
  MOCK_PLAYER_CLAIMS,
  MOCK_ROUND,
  MOCK_RULE_ELIMINATION_VOTES,
  MOCK_RULE_PREFLIGHT,
  MOCK_RULE_PROPOSALS,
  MOCK_RULE_VOTES,
} from "./mockData";

const INSTALLED_FLAG = "__idealerMockFetchInstalled";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function resolveMock(url: string): unknown | undefined {
  // Ordem importa: rotas mais específicas primeiro.
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
