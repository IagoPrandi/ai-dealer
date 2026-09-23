import { ruleAstSchema, seededRandomScenarios, type RuleAst } from "@tyche/rule-compiler";

import { canonicalJson } from "../src/jevPipelineEvaluation.js";
import { JEV_PIPELINE_CORPUS_V1, type BehaviorFixture } from "../src/jevPipelineCorpusV1.js";
import { astOutcome, type ClaimLedger, type ScenarioInput } from "../src/jevPipelineJ8Evaluation.js";
import { J8_HELDOUT_ITEMS, type J8HeldOutItem } from "../src/jevPipelineJ8HeldOut.js";
import { J10_ADVERSARIAL_ITEMS } from "../src/jevPipelineJ10Adversarial.js";
import { J9_FRESH_ITEMS } from "../src/jevPipelineJ9Fresh.js";

// Shared item loader for the J8/J9 runners and the B0 baseline, so every arm
// scores the same sources against the same hidden references.

export type ItemClass = "AMBIGUOUS" | "BLOCKED" | "CLEAR";

export interface Candidate {
  ast: RuleAst;
  id: string;
  isCorrect: boolean;
}

export interface InterpretationControl {
  expectedSupported: boolean;
  id: string;
  text: string;
}

export interface Item {
  candidates: Candidate[];
  class: ItemClass;
  expectedOutcomes: (string[] | "LOSE" | "WIN")[];
  id: string;
  interpretationControls: InterpretationControl[];
  language: "en" | "pt";
  scenarios: ScenarioInput[];
  selfTestLedger: ClaimLedger;
  source: string;
  suite: "adversarial" | "fresh" | "heldout" | "v1";
}

export function v1Scenario(fixture: BehaviorFixture): ScenarioInput {
  return {
    draw: fixture.draw,
    ...(fixture.entries ? { entries: fixture.entries } : {}),
    ...(fixture.guess ? { guess: fixture.guess } : {}),
    id: fixture.id,
  };
}

export function v1Items(): Item[] {
  return JEV_PIPELINE_CORPUS_V1.map((fixture) => {
    const reference = fixture.interpretationVariants.find((variant) => variant.kind === "reference");
    return {
      candidates: fixture.astCandidates.map((candidate) => ({
        ast: candidate.ast,
        id: candidate.id,
        isCorrect: fixture.class === "CLEAR" && candidate.kind === "reference",
      })),
      class: fixture.class,
      expectedOutcomes: fixture.behaviorFixtures.map((scenario) =>
        scenario.expectedWinners ? [...scenario.expectedWinners].sort() : scenario.expectedWin ? "WIN" : "LOSE",
      ),
      id: fixture.id,
      interpretationControls:
        fixture.class === "BLOCKED"
          ? []
          : fixture.interpretationVariants.map((variant) => ({
              expectedSupported: variant.kind === "reference",
              id: variant.id,
              text: variant.text,
            })),
      language: fixture.language,
      scenarios: fixture.behaviorFixtures.map(v1Scenario),
      selfTestLedger: {
        claims: [{ dimension: "win_condition", id: "c1", meaning: reference?.text ?? fixture.referenceInterpretation, sourceSpan: fixture.source }],
        openChoices: fixture.class === "AMBIGUOUS" ? [{ id: "q1", question: "Which measure decides the winner?", sourceSpan: null }] : [],
      },
      source: fixture.source,
      suite: "v1",
    };
  });
}

export interface BenchmarkScenario {
  draw: number[];
  entries?: Record<string, number[]>;
  id: string;
  targetPlayer: string;
  targetTicket: number[];
}

export interface BenchmarkItem {
  ast: unknown;
  id: string;
  language: "en" | "pt";
  proposal: string;
  scenarios: BenchmarkScenario[];
}

export async function heldOutItems(): Promise<Item[]> {
  // The benchmark scripts are untyped .mjs modules; the specifier is a
  // variable so the scripts tsconfig does not require declarations for them.
  const directPath = "./jev-direct-rule-evaluation.mjs";
  const semanticPath = "./jev-ast-semantic-validation.mjs";
  const direct = (await import(directPath)) as { benchmark: BenchmarkItem[] };
  const semantic = (await import(semanticPath)) as { mutateReference: (item: BenchmarkItem) => { ast: unknown } };
  const benchmarkItems: Item[] = direct.benchmark.map((item) => {
    const reference = ruleAstSchema.parse(item.ast);
    const scenarios: ScenarioInput[] = item.scenarios.map((scenario) =>
      scenario.entries
        ? { draw: scenario.draw, entries: scenario.entries, id: scenario.id, targetPlayer: scenario.targetPlayer }
        : { draw: scenario.draw, guess: scenario.targetTicket, id: scenario.id },
    );
    return {
      candidates: [
        { ast: reference, id: "reference", isCorrect: true },
        { ast: ruleAstSchema.parse(semantic.mutateReference(item).ast), id: "mutation", isCorrect: false },
      ],
      class: "CLEAR" as const,
      expectedOutcomes: scenarios.map((scenario) => astOutcome(reference, scenario)),
      id: `BENCH-${item.id}`,
      interpretationControls: [],
      language: item.language,
      scenarios,
      selfTestLedger: { claims: [{ dimension: "win_condition", id: "c1", meaning: item.proposal, sourceSpan: item.proposal }], openChoices: [] },
      source: item.proposal,
      suite: "heldout" as const,
    };
  });
  return [...benchmarkItems, ...fromHeldOutFixtures(J8_HELDOUT_ITEMS, "heldout")];
}

/** Items from the typed fixture format shared by jev-j8-heldout-v1 and jev-j9-fresh-v1. */
export function fromHeldOutFixtures(fixtures: readonly J8HeldOutItem[], suite: Item["suite"]): Item[] {
  return fixtures.map((item) => {
    const reference = item.candidates.find((candidate) => candidate.kind === "reference");
    return {
      candidates: item.candidates.map((candidate) => ({ ast: candidate.ast, id: candidate.id, isCorrect: candidate.kind === "reference" })),
      class: item.class,
      expectedOutcomes: reference ? item.scenarios.map((scenario) => astOutcome(reference.ast, scenario)) : [],
      id: item.id,
      interpretationControls: [],
      language: item.language,
      scenarios: item.scenarios,
      selfTestLedger: {
        claims: [{ dimension: "win_condition", id: "c1", meaning: item.source, sourceSpan: item.source }],
        openChoices: item.class === "AMBIGUOUS" ? [{ id: "q1", question: "Which measure decides the winner?", sourceSpan: null }] : [],
      },
      source: item.source,
      suite,
    };
  });
}

export function adversarialItems(): Item[] {
  return fromHeldOutFixtures(J10_ADVERSARIAL_ITEMS, "adversarial");
}

export function freshItems(): Item[] {
  return fromHeldOutFixtures(J9_FRESH_ITEMS, "fresh");
}

export function sameOutcome(left: string[] | "LOSE" | "WIN", right: string[] | "LOSE" | "WIN"): boolean {
  return canonicalJson(left) === canonicalJson(right);
}


let randomLibrary: ScenarioInput[] | null = null;

/** The 200 seeded random scenarios of the J3/assembly benchmark (production generator). */
export async function randomScenarioLibrary(): Promise<ScenarioInput[]> {
  randomLibrary ??= seededRandomScenarios();
  return randomLibrary;
}

function outcomeOrError(ast: RuleAst, scenario: ScenarioInput): string {
  try {
    return canonicalJson(astOutcome(ast, scenario));
  } catch (error) {
    return `ERROR:${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Scoring only, never routing: a returned AST is correct when it matches the
 * hidden reference on the curated scenarios and on all 200 random scenarios.
 * A predicate/ranking type mismatch counts as a disagreement, not an error.
 */
export async function matchesReference(item: Item, ast: RuleAst): Promise<boolean | null> {
  const reference = item.candidates.find((candidate) => candidate.isCorrect)?.ast;
  if (!reference) return null;
  const random = await randomScenarioLibrary();
  const typeOf = (value: RuleAst) => ("result" in value ? value.result.type : "predicate");
  if (typeOf(reference) !== typeOf(ast)) return false;
  // astOutcome reads `guess` for predicates and `entries` for rankings, so the
  // random scenarios can carry both.
  const scenarios = [...item.scenarios, ...random];
  return scenarios.every((scenario) => outcomeOrError(reference, scenario) === outcomeOrError(ast, scenario));
}


