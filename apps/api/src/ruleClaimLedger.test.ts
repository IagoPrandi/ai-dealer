import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { JEV_DEFAULT_EXPECTED_MODEL, JevError, type JevConfig } from "./jev.js";
import type { RuleAgentConfig } from "./llm.js";
import {
  buildVerifiedClaimLedger,
  detectRuleLanguage,
  ledgerClarificationQuestions,
} from "./ruleClaimLedger.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const LEDGER_CONFIG: RuleAgentConfig = {
  apiKey: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  maxOutputTokens: 4_096,
  model: "ledger-model",
  seed: 7,
  timeoutMs: 300_000,
};
const JEV_CONFIG: JevConfig = {
  apiKey: "k",
  endpoint: "http://127.0.0.1:11434/jev",
  expectedModel: JEV_DEFAULT_EXPECTED_MODEL,
  model: "~typesafe/jev-latest",
  timeoutMs: 5_000,
};
const SOURCE = "Win if at least 3 of your numbers are drawn.";

interface Recorded {
  jevQuestionIds: string[][];
  ledgerBodies: { messages: { content: string; role: string }[]; seed: number }[];
}

function stub(options: {
  jev: "down" | "ok" | "unsupported" | "unsupported_leaning_vague" | "vague";
  ledgers: string[];
}): Recorded {
  const recorded: Recorded = { jevQuestionIds: [], ledgerBodies: [] };
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url === JEV_CONFIG.endpoint) {
      if (options.jev === "down") return new Response("down", { status: 503 });
      const questions = body.questions as Record<string, unknown>;
      recorded.jevQuestionIds.push(Object.keys(questions));
      const answers = Object.fromEntries(
        Object.keys(questions).map((id) => {
          if (options.jev.startsWith("unsupported") && id.endsWith("_supported")) return [id, { noul: 0.5, type: "noul" }];
          if (options.jev === "unsupported_leaning_vague" && id.endsWith("_vague")) return [id, { noul: 0.6, type: "noul" }];
          const yes = options.jev === "vague" ? id.endsWith("_vague") || id.endsWith("_supported") : !/_vague$|_material$/u.test(id);
          return [id, { noul: yes ? 0.95 : 0.04, type: "noul" }];
        }),
      );
      return new Response(JSON.stringify({ answers, model: JEV_DEFAULT_EXPECTED_MODEL, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
    }
    recorded.ledgerBodies.push(body as unknown as Recorded["ledgerBodies"][number]);
    const content = options.ledgers[Math.min(recorded.ledgerBodies.length - 1, options.ledgers.length - 1)]!;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return recorded;
}

const ledger = (meaning: string) =>
  JSON.stringify({ claims: [{ dimension: "win_condition", meaning, sourceSpan: "Win if at least 3 of your numbers are drawn" }], openChoices: [] });

test("a ledger that drops a material term is revised once, then verified by Jev", async () => {
  const recorded = stub({ jev: "ok", ledgers: [ledger("Win if 3 of your numbers are drawn."), ledger("Win if at least 3 of your numbers are drawn.")] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "LEDGER_VERIFIED");
  assert.equal(run.llmAttempts, 2);
  const revision = recorded.ledgerBodies[1]!.messages;
  assert.equal(revision.at(-2)?.role, "assistant");
  assert.match(revision.at(-1)?.content ?? "", /LEDGER_MEANING_DROPS_TERM/u);
  // The decoder is constrained to the flat ledger schema.
  assert.equal((recorded.ledgerBodies[0] as unknown as { response_format: { json_schema: { name: string } } }).response_format.json_schema.name, "tyche_claim_ledger");
});

test("a ledger that stays defective after its revision and one fresh generation routes to review, never to compile", async () => {
  const recorded = stub({ jev: "ok", ledgers: [ledger("Win if 3 of your numbers are drawn.")] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "REVIEW_LEDGER_INCOMPLETE");
  assert.equal(run.llmAttempts, 4);
  // The fresh generation is an independent sample: no conversation, new seed.
  assert.equal(recorded.ledgerBodies[2]!.messages.length, 2);
  assert.deepEqual(recorded.ledgerBodies.map((body) => body.seed), [7, 7, 8, 8]);
});

const PARAPHRASE = "You win when at least 3 of your numbers are drawn.";

test("a Jev interpretation defect buys one fresh generation, which can verify", async () => {
  const recorded = stub({ jev: "unsupported", ledgers: [ledger(PARAPHRASE), ledger(PARAPHRASE), ledger("Win if at least 3 of your numbers are drawn.")] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "LEDGER_VERIFIED");
  assert.equal(run.llmAttempts, 3);
  // The verbatim claim is decided by code, so Jev is not asked whether it is supported.
  assert.deepEqual(recorded.jevQuestionIds.at(-1), ["claim_0_vague"]);
});

test("a defect ledger in which Jev leans ambiguous is not regenerated", async () => {
  stub({ jev: "unsupported_leaning_vague", ledgers: [ledger(PARAPHRASE), ledger(PARAPHRASE), ledger("Win if at least 3 of your numbers are drawn.")] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "REVIEW_INTERPRETATION_DEFECT");
  assert.deepEqual(run.judgment.ambiguitySignals, ["claim_0_vague"]);
  assert.equal(run.llmAttempts, 2);
});

test("unparseable ledger output is revised once and otherwise reviewed", async () => {
  stub({ jev: "ok", ledgers: ["not json"] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "REVIEW_LEDGER_INCOMPLETE");
  assert.match(run.judgment.reasons[0] ?? "", /LEDGER_MALFORMED/u);
});

test("a claim Jev judges vague becomes a neutral clarification question", async () => {
  stub({ jev: "vague", ledgers: [ledger("Win if at least 3 of your numbers are drawn.")] });
  const run = await buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE });
  assert.equal(run.judgment.decision, "CLARIFY");
  // A question about the source is never regenerated away.
  assert.equal(run.llmAttempts, 1);
  assert.deepEqual(ledgerClarificationQuestions(run.ledger!, run.judgment), [
    'What exact measure or number decides "Win if at least 3 of your numbers are drawn"?',
  ]);
});

test("a Jev outage propagates as a typed failure instead of a verdict", async () => {
  stub({ jev: "down", ledgers: [ledger("Win if at least 3 of your numbers are drawn.")] });
  await assert.rejects(
    buildVerifiedClaimLedger({ jevConfig: JEV_CONFIG, ledgerConfig: LEDGER_CONFIG, source: SOURCE }),
    (error: unknown) => error instanceof JevError && error.code === "JEV_UNAVAILABLE",
  );
});

test("the language label distinguishes Portuguese from English rules", () => {
  assert.equal(detectRuleLanguage("Vence quem acertar pelo menos três números."), "pt");
  assert.equal(detectRuleLanguage("Ganha se a soma for maior que 200."), "pt");
  assert.equal(detectRuleLanguage("Win if at least three numbers match."), "en");
});
