import {
  evaluatePredicate,
  evaluateRankingEntry,
  ruleAstSchema,
} from "@tyche/rule-compiler";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { benchmark } from "./jev-direct-rule-evaluation.mjs";
import { configuredValue, decide, openRouterKey } from "./jev-rule-probe.mjs";

// Read-only experiment. Jev fills one hole of a schemaVersion 3 rule tree at a
// time; the option menu at every hole comes from the grammar itself, never from
// the reference AST. Reference ASTs are hidden local oracles used only to score
// the finished candidate. Nothing here can authorize, submit, or freeze a rule.

const GAME_DOMAIN = {
  ticket:
    "Six distinct integers from 1 through 100; listed order matters only when the proposal explicitly refers to positions.",
  draw: "Six distinct integers from 1 through 100.",
  comparative_rules:
    "A ranking rule scores every submitted ticket; every ticket tied at the best eligible score wins.",
};

const MAX_NODES = 64;
const MAX_STEPS = 60;
const MAX_DEPTH = 10;
const MAX_BINDERS = 2;

// ---------------------------------------------------------------------------
// Grammar catalog: one entry per schemaVersion 3 node kind, listing the holes
// it opens and the enum/integer fields it needs. Derived from
// packages/rule-schema; it contains no knowledge of any particular proposal.
// ---------------------------------------------------------------------------

const ARRAY_KINDS = {
  source: {
    doc: "One of the two raw number lists, exactly as supplied.",
    enums: ["source_side"],
    build: (p) => ({
      node: { kind: "source", source: p.source_side },
      holes: [],
    }),
  },
  sort: {
    doc: "Reorder a list by numeric value, ascending or descending.",
    enums: ["sort_order"],
    build: (p) => ({
      node: { kind: "sort", order: p.sort_order, of: null },
      holes: [["of", "array", null]],
    }),
  },
  reverse: {
    doc: "Reverse the positional order of a list.",
    build: () => ({
      node: { kind: "reverse", of: null },
      holes: [["of", "array", null]],
    }),
  },
  distinct: {
    doc: "Drop repeated values, keeping one copy of each distinct value.",
    build: () => ({
      node: { kind: "distinct", of: null },
      holes: [["of", "array", null]],
    }),
  },
  digits: {
    doc: "Replace every number by one of its decimal digits (units or tens).",
    enums: ["digits_place"],
    build: (p) => ({
      node: { kind: "digits", place: p.digits_place, of: null },
      holes: [["of", "array", null]],
    }),
  },
  intersection: {
    doc: "The values present in both lists.",
    build: () => ({
      node: { kind: "intersection", left: null, right: null },
      holes: [
        ["left", "array", null],
        ["right", "array", null],
      ],
    }),
  },
  difference: {
    doc: "The values of the first list that are absent from the second.",
    build: () => ({
      node: { kind: "difference", left: null, right: null },
      holes: [
        ["left", "array", null],
        ["right", "array", null],
      ],
    }),
  },
  slice: {
    doc: "A contiguous positional segment of a list.",
    enums: ["slice_start", "slice_end"],
    build: (p) => ({
      node: {
        kind: "slice",
        start: p.slice_start,
        ...(p.slice_end === null ? {} : { end: p.slice_end }),
        of: null,
      },
      holes: [["of", "array", "static"]],
    }),
  },
  map: {
    doc: "Compute one new number from each element of a list.",
    binder: "elem",
    build: () => ({
      node: { kind: "map", of: null, expr: null },
      holes: [
        ["of", "array", null],
        ["expr", "scalar", null],
      ],
    }),
  },
  filter: {
    doc: "Keep only the elements of a list that satisfy a condition.",
    binder: "elem",
    build: () => ({
      node: { kind: "filter", of: null, where: null },
      holes: [
        ["of", "array", null],
        ["where", "predicate", null],
      ],
    }),
  },
  pairs_map: {
    doc: "Walk two lists position by position and compute one number per pair.",
    binder: "pair",
    build: () => ({
      node: { kind: "pairs_map", left: null, right: null, expr: null },
      holes: [
        ["left", "array", null],
        ["right", "array", null],
        ["expr", "scalar", null],
      ],
    }),
  },
};

const STATIC_LENGTH_ARRAY_KINDS = new Set([
  "source",
  "sort",
  "reverse",
  "digits",
  "map",
  "slice",
  "pairs_map",
]);

const SCALAR_KINDS = {
  lit: {
    doc: "A fixed number stated by the rule.",
    enums: ["lit_value"],
    build: (p) => ({ node: { kind: "lit", value: p.lit_value }, holes: [] }),
  },
  reduce: {
    doc: "Collapse a whole list into one number (sum, product, count, min, max, range span).",
    enums: ["reduce_op"],
    build: (p) => ({
      node: { kind: "reduce", op: p.reduce_op, of: null },
      holes: [["of", "array", null]],
    }),
  },
  at: {
    doc: "The number at one fixed position of a list.",
    enums: ["at_index"],
    build: (p) => ({
      node: { kind: "at", index: p.at_index, of: null },
      holes: [["of", "array", "static"]],
    }),
  },
  arith: {
    doc: "Combine two numbers with add, subtract, multiply, divide, or remainder.",
    enums: ["arith_op"],
    build: (p) => ({
      node: { kind: "arith", op: p.arith_op, left: null, right: null },
      holes: [
        ["left", "scalar", null],
        ["right", "scalar", null],
      ],
    }),
  },
  abs: {
    doc: "The absolute value of a number.",
    build: () => ({
      node: { kind: "abs", of: null },
      holes: [["of", "scalar", null]],
    }),
  },
  ite: {
    doc: "Pick one of two numbers depending on a condition.",
    build: () => ({
      node: { kind: "ite", if: null, then: null, else: null },
      holes: [
        ["if", "predicate", null],
        ["then", "scalar", null],
        ["else", "scalar", null],
      ],
    }),
  },
  elem: {
    doc: "The current element of the surrounding per-element scope.",
    enums: ["elem_up"],
    needsElem: true,
    build: (p) => ({
      node: p.elem_up ? { kind: "elem", up: 1 } : { kind: "elem" },
      holes: [],
    }),
  },
  pair: {
    doc: "One side of the current position pair in a paired walk.",
    enums: ["pair_side"],
    needsPair: true,
    build: (p) => ({ node: { kind: "pair", side: p.pair_side }, holes: [] }),
  },
};

const PREDICATE_KINDS = {
  compare: {
    doc: "Compare two numbers.",
    enums: ["compare_op"],
    build: (p) => ({
      node: { kind: "compare", op: p.compare_op, left: null, right: null },
      holes: [
        ["left", "scalar", null],
        ["right", "scalar", null],
      ],
    }),
  },
  contains: {
    doc: "Test whether a list contains a given number.",
    build: () => ({
      node: { kind: "contains", array: null, value: null },
      holes: [
        ["array", "array", null],
        ["value", "scalar", null],
      ],
    }),
  },
  forall: {
    doc: "True when every element of a list satisfies a condition.",
    binder: "elem",
    build: () => ({
      node: { kind: "forall", of: null, where: null },
      holes: [
        ["of", "array", null],
        ["where", "predicate", null],
      ],
    }),
  },
  exists: {
    doc: "True when at least one element of a list satisfies a condition.",
    binder: "elem",
    build: () => ({
      node: { kind: "exists", of: null, where: null },
      holes: [
        ["of", "array", null],
        ["where", "predicate", null],
      ],
    }),
  },
  pairs_forall: {
    doc: "True when every position pair of two lists satisfies a condition.",
    binder: "pair",
    build: () => ({
      node: { kind: "pairs_forall", left: null, right: null, where: null },
      holes: [
        ["left", "array", null],
        ["right", "array", null],
        ["where", "predicate", null],
      ],
    }),
  },
  pairs_exists: {
    doc: "True when at least one position pair of two lists satisfies a condition.",
    binder: "pair",
    build: () => ({
      node: { kind: "pairs_exists", left: null, right: null, where: null },
      holes: [
        ["left", "array", null],
        ["right", "array", null],
        ["where", "predicate", null],
      ],
    }),
  },
  and: {
    doc: "True only when all of several conditions hold.",
    enums: ["clause_count"],
    build: (p) => ({
      node: { kind: "and", clauses: new Array(p.clause_count).fill(null) },
      holes: Array.from({ length: p.clause_count }, (_, index) => [
        ["clauses", index],
        "predicate",
        null,
      ]),
    }),
  },
  or: {
    doc: "True when at least one of several conditions holds.",
    enums: ["clause_count"],
    build: (p) => ({
      node: { kind: "or", clauses: new Array(p.clause_count).fill(null) },
      holes: Array.from({ length: p.clause_count }, (_, index) => [
        ["clauses", index],
        "predicate",
        null,
      ]),
    }),
  },
  not: {
    doc: "True exactly when the inner condition is false.",
    build: () => ({
      node: { kind: "not", clause: null },
      holes: [["clause", "predicate", null]],
    }),
  },
};

const CATALOG = {
  array: ARRAY_KINDS,
  scalar: SCALAR_KINDS,
  predicate: PREDICATE_KINDS,
};

const ENUM_QUESTIONS = {
  source_side: {
    text: "Which of the two supplied lists does this part of the rule read?",
    options: {
      guess: "The player's own six numbers.",
      draw: "The six officially drawn numbers.",
    },
  },
  sort_order: {
    text: "In which direction must this list be sorted?",
    options: { asc: "Smallest value first.", desc: "Largest value first." },
  },
  digits_place: {
    text: "Which decimal digit of each number does the rule use?",
    options: { units: "The last digit.", tens: "The tens digit." },
  },
  slice_start: {
    text: "At which zero-based position does the segment start?",
    options: {
      0: "Position 0.",
      1: "Position 1.",
      2: "Position 2.",
      3: "Position 3.",
      4: "Position 4.",
      5: "Position 5.",
    },
    numeric: true,
  },
  slice_end: {
    text: "At which zero-based position does the segment end (exclusive)?",
    options: {
      none: "Run to the end of the list.",
      1: "Stop before position 1.",
      2: "Stop before position 2.",
      3: "Stop before position 3.",
      4: "Stop before position 4.",
      5: "Stop before position 5.",
      6: "Stop before position 6.",
    },
    numericOrNull: true,
  },
  reduce_op: {
    text: "Which single number does the rule take from this whole list?",
    options: {
      sum: "The total of all values.",
      product: "The product of all values.",
      count: "How many values the list holds.",
      min: "The smallest value.",
      max: "The largest value.",
      range_span: "The largest value minus the smallest value.",
    },
  },
  arith_op: {
    text: "Which arithmetic operation combines the two numbers?",
    options: {
      add: "Addition.",
      sub: "Subtraction, left minus right.",
      mul: "Multiplication.",
      div: "Integer division, left divided by right.",
      mod: "Remainder of left divided by right.",
    },
  },
  at_index: {
    text: "Which zero-based position of the list does the rule read?",
    options: {
      0: "First.",
      1: "Second.",
      2: "Third.",
      3: "Fourth.",
      4: "Fifth.",
      5: "Sixth.",
    },
    numeric: true,
  },
  elem_up: {
    text: "Which per-element scope does this element belong to?",
    options: {
      0: "The innermost per-element scope.",
      1: "The enclosing outer per-element scope.",
    },
    numeric: true,
  },
  pair_side: {
    text: "Which side of the current position pair does the rule read?",
    options: {
      left: "The left list's value at this position.",
      right: "The right list's value at this position.",
    },
  },
  compare_op: {
    text: "Which comparison does the rule apply between the two numbers?",
    options: {
      eq: "Left equals right.",
      neq: "Left differs from right.",
      lt: "Left is strictly less than right.",
      lte: "Left is less than or equal to right.",
      gt: "Left is strictly greater than right.",
      gte: "Left is greater than or equal to right.",
    },
  },
  clause_count: {
    text: "How many separate conditions are combined at this point?",
    options: {
      2: "Two conditions.",
      3: "Three conditions.",
      4: "Four conditions.",
    },
    numeric: true,
  },
};

// Proposal-independent integer menu: the decimal base, the counts a six-number
// ticket can produce, and every number the proposal itself states in digits or
// in English/Portuguese words.
const BASE_INTEGERS = [0, 1, 2, 3, 4, 5, 6, 10];
const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
};

function integerMenu(proposal) {
  const found = new Set(BASE_INTEGERS);
  for (const match of proposal.matchAll(/\d+/gu)) {
    const value = Number(match[0]);
    if (Number.isInteger(value) && value >= 0 && value <= 600) found.add(value);
  }
  const normalized = proposal
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase();
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "u").test(normalized)) {
      found.add(value);
    }
  }
  return [...found].sort((a, b) => a - b).slice(0, 18);
}

// ---------------------------------------------------------------------------
// Option menus. Legality is decided by the schema alone: binder scope, binder
// depth, static-length requirements, and the remaining node budget.
// ---------------------------------------------------------------------------

function legalKinds(hole, assembler) {
  const catalog = CATALOG[hole.type];
  const binders = hole.binders;
  const top = binders[binders.length - 1] ?? null;
  const outer = binders[binders.length - 2] ?? null;
  const terminalsOnly =
    hole.depth >= MAX_DEPTH ||
    assembler.nodeCount + assembler.openHoles >= MAX_NODES;
  return Object.keys(catalog).filter((kind) => {
    const entry = catalog[kind];
    if (entry.needsElem && top !== "elem" && outer !== "elem") return false;
    if (entry.needsPair && top !== "pair") return false;
    if (entry.binder && binders.length >= MAX_BINDERS) return false;
    if (hole.constraint === "static" && hole.type === "array") {
      if (!STATIC_LENGTH_ARRAY_KINDS.has(kind)) return false;
    }
    if (terminalsOnly) {
      if (hole.type === "array") return kind === "source";
      if (hole.type === "scalar") {
        return kind === "lit" || kind === "elem" || kind === "pair";
      }
      return kind === "compare";
    }
    return true;
  });
}

function enumOptionsFor(name, hole, assembler) {
  const question = ENUM_QUESTIONS[name];
  if (name === "lit_value") return null;
  if (name === "elem_up") {
    const binders = hole.binders;
    const top = binders[binders.length - 1] ?? null;
    const outer = binders[binders.length - 2] ?? null;
    const allowed = [];
    if (top === "elem") allowed.push("0");
    if (outer === "elem") allowed.push("1");
    return Object.fromEntries(
      allowed.map((key) => [key, question.options[key]]),
    );
  }
  if (name === "lit_value") return null;
  void assembler;
  return question.options;
}

function decodeEnum(name, raw, assembler) {
  if (name === "lit_value") return Number(raw);
  const question = ENUM_QUESTIONS[name];
  if (question.numericOrNull) return raw === "none" ? null : Number(raw);
  if (question.numeric) return Number(raw);
  void assembler;
  return raw;
}

const LIT_QUESTION_TEXT =
  "Which fixed number does the rule state at this point of the tree?";

const BODY_FIELDS = new Set(["expr", "where"]);

function describeBinders(binders) {
  if (binders.length === 0) {
    return "Top level: no per-element scope is open, so `elem` and `pair` cannot be used here.";
  }
  return binders
    .map((binder, index) =>
      binder === "elem"
        ? `Scope ${index + 1}: one element of a list at a time, referred to as elem.`
        : `Scope ${index + 1}: one position pair of two lists at a time, referred to as pair.`,
    )
    .join(" ");
}

function renderTree(root, currentHoleId) {
  return JSON.parse(
    JSON.stringify(root, (key, value) => {
      if (
        value &&
        typeof value === "object" &&
        typeof value.__hole__ === "number"
      ) {
        return value.__hole__ === currentHoleId
          ? "<<FILL_THIS_HOLE>>"
          : `<pending ${value.__type__}>`;
      }
      return value;
    }),
  );
}

function newAssembler() {
  return {
    root: { schemaVersion: 3, result: null },
    holes: [],
    pending: [],
    nextId: 0,
    nodeCount: 0,
    get openHoles() {
      return this.pending.length;
    },
  };
}

function addHole(
  assembler,
  container,
  key,
  type,
  binders,
  depth,
  path,
  constraint,
) {
  const hole = {
    id: assembler.nextId,
    container,
    key,
    type,
    binders,
    depth,
    path,
    constraint,
  };
  assembler.nextId += 1;
  container[key] = { __hole__: hole.id, __type__: type };
  assembler.holes.push(hole);
  return hole;
}

function fillHole(assembler, hole, kind, params) {
  const entry = CATALOG[hole.type][kind];
  const built = entry.build(params);
  hole.container[hole.key] = built.node;
  assembler.nodeCount += 1;
  const innerBinders = entry.binder
    ? [...hole.binders, entry.binder]
    : hole.binders;
  const children = [];
  for (const [field, type, constraint] of built.holes) {
    const isIndexed = Array.isArray(field);
    const container = isIndexed ? built.node[field[0]] : built.node;
    const key = isIndexed ? field[1] : field;
    const label = isIndexed ? `${field[0]}[${field[1]}]` : field;
    const binders = BODY_FIELDS.has(label) ? innerBinders : hole.binders;
    children.push(
      addHole(
        assembler,
        container,
        key,
        type,
        binders,
        hole.depth + 1,
        `${hole.path}.${label}`,
        constraint,
      ),
    );
  }
  return children;
}

// ---------------------------------------------------------------------------
// Jev questions for one hole.
// ---------------------------------------------------------------------------

function holeQuestions(hole, kinds, assembler, menus) {
  const catalog = CATALOG[hole.type];
  const questions = {
    kind: {
      type: "choice",
      instructions: `The rule tree has exactly one hole marked <<FILL_THIS_HOLE>> at path \`${hole.path}\`, which must hold ${
        hole.type === "predicate"
          ? "a true/false condition"
          : hole.type === "array"
            ? "a list of numbers"
            : "a single number"
      }. Using rule_proposal, decide which construct belongs there. Judge only this hole; the remaining holes are filled in later steps.`,
      criteria: Object.fromEntries(
        kinds.map((kind) => [kind, catalog[kind].doc]),
      ),
    },
  };
  const needed = new Set();
  for (const kind of kinds) {
    for (const name of catalog[kind].enums ?? []) needed.add(name);
  }
  const resolved = {};
  for (const name of needed) {
    const options =
      name === "lit_value"
        ? Object.fromEntries(
            menus.integers.map((value) => [
              String(value),
              `The number ${value}.`,
            ]),
          )
        : enumOptionsFor(name, hole, assembler);
    const keys = Object.keys(options ?? {});
    if (keys.length === 0) continue;
    if (keys.length === 1) {
      resolved[name] = keys[0];
      continue;
    }
    questions[name] = {
      type: "choice",
      instructions: `${
        name === "lit_value" ? LIT_QUESTION_TEXT : ENUM_QUESTIONS[name].text
      } This applies only to some of the constructs offered for \`${hole.path}\`; it is ignored when the selected construct does not use it.`,
      criteria: options,
    };
  }
  return { questions, resolved };
}

function stateForHole(assembler, hole, proposal, transcript, planGuidance) {
  const state = {
    game_context: GAME_DOMAIN,
    rule_proposal: proposal,
    assembly_task:
      "A winning rule is being assembled one node at a time into a fixed expression grammar over the two lists. Exactly one hole is decided per step; earlier decisions are final and later holes stay pending.",
    partial_rule_tree: renderTree(assembler.root, hole.id),
    current_hole: {
      path: hole.path,
      expects: hole.type,
      scope: describeBinders(hole.binders),
      remaining_node_budget: MAX_NODES - assembler.nodeCount,
    },
    decisions_so_far: transcript,
  };
  if (planGuidance) state.assembly_plan_guidance = planGuidance;
  return state;
}

function readChoice(answers, id) {
  const answer = answers?.[id];
  if (!answer || typeof answer.choice !== "string") return null;
  return {
    choice: answer.choice,
    probability: answer.probabilities?.[answer.choice] ?? null,
    confidence: answer.confidence ?? null,
    probabilities: answer.probabilities ?? null,
  };
}

// ---------------------------------------------------------------------------
// Deciders. `jevDecider` asks Jev; `oracleDecider` reads the reference AST and
// exists only to prove the assembler can reach it (a self-test of this script,
// never part of a measured run).
// ---------------------------------------------------------------------------

function paramsFromNode(kind, node) {
  switch (kind) {
    case "source":
      return { source_side: node.source };
    case "sort":
      return { sort_order: node.order };
    case "digits":
      return { digits_place: node.place };
    case "slice":
      return { slice_start: node.start, slice_end: node.end ?? null };
    case "reduce":
      return { reduce_op: node.op };
    case "at":
      return { at_index: node.index };
    case "arith":
      return { arith_op: node.op };
    case "lit":
      return { lit_value: node.value };
    case "elem":
      return { elem_up: node.up ?? 0 };
    case "pair":
      return { pair_side: node.side };
    case "compare":
      return { compare_op: node.op };
    case "and":
    case "or":
      return { clause_count: node.clauses.length };
    default:
      return {};
  }
}

function nodeAtPath(referenceAst, path) {
  const segments = path.split(".").slice(1);
  let node = referenceAst.result;
  for (const segment of segments) {
    const indexed = /^(\w+)\[(\d+)\]$/u.exec(segment);
    node = indexed ? node[indexed[1]][Number(indexed[2])] : node[segment];
  }
  return node;
}

function createOracleDecider(referenceAst) {
  return {
    async result() {
      const result = referenceAst.result;
      return {
        params: {
          result_type: result.type,
          ranking_direction: result.direction ?? "max",
          ranking_eligibility: result.eligibleWhen ? "yes" : "no",
        },
        raw: null,
      };
    },
    async hole(hole, kinds) {
      const node = nodeAtPath(referenceAst, hole.path);
      if (!node || !kinds.includes(node.kind)) {
        throw new Error(
          `self-test: ${hole.path} needs \`${node?.kind}\`, which the menu does not offer (${kinds.join(", ")})`,
        );
      }
      return {
        kind: node.kind,
        params: paramsFromNode(node.kind, node),
        raw: null,
      };
    },
  };
}

function createJevDecider(proposal, planGuidance, telemetry) {
  return {
    async result(assembler, menus, transcript) {
      const questions = {
        result_type: {
          type: "choice",
          instructions:
            "Does rule_proposal decide each ticket on its own, or does it compare all submitted tickets against each other?",
          criteria: {
            predicate:
              "Each ticket wins or loses on its own merits, with no comparison against other tickets.",
            ranking:
              "Tickets are scored and compared; the best score among all submitted tickets wins.",
          },
        },
        ranking_direction: {
          type: "choice",
          instructions:
            "If the rule compares tickets, does the best score mean the highest or the lowest value? Ignored when the rule is not comparative.",
          criteria: {
            max: "The highest score wins.",
            min: "The lowest score wins.",
          },
        },
        ranking_eligibility: {
          type: "choice",
          instructions:
            "If the rule compares tickets, does it also state a condition a ticket must satisfy before it may take part in the comparison? Ignored when the rule is not comparative.",
          criteria: {
            yes: "Some tickets are excluded from the comparison by a stated condition.",
            no: "Every submitted ticket takes part in the comparison.",
          },
        },
      };
      const state = {
        game_context: GAME_DOMAIN,
        rule_proposal: proposal,
        assembly_task:
          "A winning rule is being assembled one node at a time. This first step fixes the overall shape of the rule.",
        decisions_so_far: transcript,
      };
      if (planGuidance) state.assembly_plan_guidance = planGuidance;
      const response = await decide(state, questions);
      telemetry.record(response);
      const resultType = readChoice(response.answers, "result_type");
      const direction = readChoice(response.answers, "ranking_direction");
      const eligibility = readChoice(response.answers, "ranking_eligibility");
      void assembler;
      void menus;
      return {
        params: {
          result_type:
            resultType?.choice === "ranking" ? "ranking" : "predicate",
          ranking_direction: direction?.choice === "min" ? "min" : "max",
          ranking_eligibility: eligibility?.choice === "yes" ? "yes" : "no",
        },
        raw: {
          result_type: resultType,
          ranking_direction: direction,
          ranking_eligibility: eligibility,
        },
      };
    },
    async hole(hole, kinds, assembler, menus, transcript) {
      const { questions, resolved } = holeQuestions(
        hole,
        kinds,
        assembler,
        menus,
      );
      const state = stateForHole(
        assembler,
        hole,
        proposal,
        transcript,
        planGuidance,
      );
      const response = await decide(state, questions);
      telemetry.record(response);
      const kindAnswer = readChoice(response.answers, "kind");
      const kind = kinds.includes(kindAnswer?.choice)
        ? kindAnswer.choice
        : kinds[0];
      const params = {};
      const raw = { kind: kindAnswer };
      for (const name of CATALOG[hole.type][kind].enums ?? []) {
        if (name in resolved) {
          params[name] = decodeEnum(name, resolved[name], assembler);
          continue;
        }
        const answer = readChoice(response.answers, name);
        const options = Object.keys(questions[name]?.criteria ?? {});
        const chosen =
          answer && options.includes(answer.choice)
            ? answer.choice
            : options[0];
        params[name] = decodeEnum(name, chosen, assembler);
        raw[name] = answer;
      }
      return {
        kind,
        params,
        raw,
        fallbackKind: !kinds.includes(kindAnswer?.choice),
      };
    },
  };
}

function createTelemetry() {
  return {
    calls: 0,
    latencyMs: 0,
    costUsd: 0,
    model: null,
    record(response) {
      this.calls += 1;
      this.latencyMs += response.latencyMs ?? 0;
      this.costUsd += response.usage?.cost ?? response.estimatedCostUsd ?? 0;
      this.model ??= response.model ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// The assembly loop itself. Identical for both flows; only the option menus and
// the optional plan guidance differ.
// ---------------------------------------------------------------------------

async function assemble(proposal, decider, menus, narrow) {
  const assembler = newAssembler();
  const transcript = [];
  const steps = [];
  const started = performance.now();
  let forcedSteps = 0;

  const resultDecision = await decider.result(assembler, menus, transcript);
  const params = resultDecision.params;
  let firstHoles;
  if (params.result_type === "ranking") {
    const node = {
      type: "ranking",
      score: null,
      direction: params.ranking_direction,
      tieBreak: "share_pool",
    };
    assembler.root.result = node;
    firstHoles = [];
    if (params.ranking_eligibility === "yes") {
      node.eligibleWhen = null;
      firstHoles.push(
        addHole(
          assembler,
          node,
          "eligibleWhen",
          "predicate",
          [],
          1,
          "result.eligibleWhen",
          null,
        ),
      );
    }
    firstHoles.push(
      addHole(assembler, node, "score", "scalar", [], 1, "result.score", null),
    );
    transcript.push(
      `result = ranking(direction=${params.ranking_direction}, eligibility=${params.ranking_eligibility})`,
    );
  } else {
    const node = { type: "predicate", predicate: null };
    assembler.root.result = node;
    firstHoles = [
      addHole(
        assembler,
        node,
        "predicate",
        "predicate",
        [],
        1,
        "result.predicate",
        null,
      ),
    ];
    transcript.push("result = predicate");
  }
  steps.push({
    step: 1,
    path: "result",
    holeType: "result",
    optionCount: 2,
    chosen: params.result_type,
    params,
    raw: resultDecision.raw,
  });
  assembler.pending = firstHoles;

  let status = "COMPLETE";
  while (assembler.pending.length > 0) {
    if (steps.length >= MAX_STEPS || assembler.nodeCount >= MAX_NODES) {
      status = "BUDGET_EXHAUSTED";
      break;
    }
    const hole = assembler.pending.shift();
    let kinds = legalKinds(hole, assembler);
    const legalCount = kinds.length;
    if (narrow) kinds = narrow(hole, kinds);
    if (kinds.length === 0) {
      status = "NO_LEGAL_OPTION";
      break;
    }
    let decision;
    if (
      kinds.length === 1 &&
      (CATALOG[hole.type][kinds[0]].enums ?? []).length === 0
    ) {
      forcedSteps += 1;
      decision = { kind: kinds[0], params: {}, raw: null, forced: true };
    } else {
      try {
        decision = await decider.hole(
          hole,
          kinds,
          assembler,
          menus,
          transcript,
        );
      } catch (error) {
        status = `STEP_ERROR: ${error.message}`;
        break;
      }
    }
    const children = fillHole(assembler, hole, decision.kind, decision.params);
    assembler.pending.unshift(...children);
    const rendered = Object.entries(decision.params)
      .map(([name, value]) => `${name}=${value}`)
      .join(", ");
    transcript.push(
      `${hole.path} = ${decision.kind}${rendered ? `(${rendered})` : ""}`,
    );
    steps.push({
      step: steps.length + 1,
      path: hole.path,
      holeType: hole.type,
      legalOptionCount: legalCount,
      optionCount: kinds.length,
      offered: kinds,
      chosen: decision.kind,
      params: decision.params,
      forced: Boolean(decision.forced),
      fallbackKind: Boolean(decision.fallbackKind),
      raw: decision.raw,
    });
  }

  return {
    status,
    ast: status === "COMPLETE" ? assembler.root : null,
    partial: renderTree(assembler.root, -1),
    steps,
    transcript,
    forcedSteps,
    nodeCount: assembler.nodeCount,
    wallClockMs: Math.round(performance.now() - started),
  };
}

// ---------------------------------------------------------------------------
// Scoring. Behavior against the reference AST is the oracle; structural
// identity is only a diagnostic, since different trees can be equivalent.
// ---------------------------------------------------------------------------

function outcomeFor(ast, scenario) {
  try {
    if (ast.result.type === "predicate") {
      return evaluatePredicate(ast, {
        guess: scenario.targetTicket,
        draw: scenario.draw,
      }).result;
    }
    const entries = scenario.entries ?? { "player-A": scenario.targetTicket };
    const evaluated = Object.entries(entries).map(([player, guess]) => ({
      player,
      ...evaluateRankingEntry(ast, { guess, draw: scenario.draw }),
    }));
    const eligible = evaluated.filter((entry) => entry.eligible);
    if (eligible.length === 0) return "LOSE";
    const scores = eligible.map((entry) => entry.score);
    const best =
      ast.result.direction === "min"
        ? Math.min(...scores)
        : Math.max(...scores);
    const target = scenario.targetPlayer ?? "player-A";
    return eligible.some(
      (entry) => entry.player === target && entry.score === best,
    )
      ? "WIN"
      : "LOSE";
  } catch (error) {
    return `ERROR: ${error.message}`.slice(0, 80);
  }
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomScenarios(count) {
  const rng = mulberry32(0x5eed1234);
  const shuffle = (values) => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const distinct = (size, exclude = new Set()) => {
    const chosen = new Set();
    while (chosen.size < size) {
      const value = 1 + Math.floor(rng() * 100);
      if (!exclude.has(value)) chosen.add(value);
    }
    return [...chosen];
  };
  const scenarios = [];
  for (let index = 0; index < count; index += 1) {
    const draw = distinct(6);
    const drawSet = new Set(draw);
    const ticket = () => {
      const overlap = Math.floor(rng() * 7);
      const kept = shuffle(draw).slice(0, overlap);
      return shuffle([...kept, ...distinct(6 - overlap, drawSet)]);
    };
    const entries = { "player-A": ticket(), B: ticket(), C: ticket() };
    scenarios.push({
      id: `random-${index + 1}`,
      draw: shuffle(draw),
      entries,
      targetTicket: entries["player-A"],
      targetPlayer: "player-A",
    });
  }
  return scenarios;
}

const RANDOM_SCENARIOS = randomScenarios(200);

function scoreCandidate(item, ast) {
  const parsed = ruleAstSchema.safeParse(ast);
  if (!parsed.success) {
    return {
      schemaValid: false,
      schemaIssues: parsed.error.issues
        .map((issue) => issue.message)
        .slice(0, 6),
    };
  }
  const fixtures = item.scenarios.map((scenario) => ({
    scenarioId: scenario.id,
    expected: outcomeFor(item.ast, scenario),
    actual: outcomeFor(ast, scenario),
  }));
  const fixtureMatches = fixtures.filter(
    (row) => row.expected === row.actual,
  ).length;
  let agreements = 0;
  let referenceWins = 0;
  let candidateWins = 0;
  let candidateErrors = 0;
  const disagreements = [];
  for (const scenario of RANDOM_SCENARIOS) {
    const expected = outcomeFor(item.ast, scenario);
    const actual = outcomeFor(ast, scenario);
    if (expected === "WIN") referenceWins += 1;
    if (actual === "WIN") candidateWins += 1;
    if (typeof actual === "string" && actual.startsWith("ERROR"))
      candidateErrors += 1;
    if (expected === actual) agreements += 1;
    else if (disagreements.length < 3)
      disagreements.push({ scenario, expected, actual });
  }
  return {
    schemaValid: true,
    fixtures,
    fixtureMatches,
    fixtureTotal: fixtures.length,
    fixtureExact: fixtureMatches === fixtures.length,
    randomAgreement: agreements / RANDOM_SCENARIOS.length,
    randomScenarios: RANDOM_SCENARIOS.length,
    referenceWinRate: referenceWins / RANDOM_SCENARIOS.length,
    candidateWinRate: candidateWins / RANDOM_SCENARIOS.length,
    candidateRuntimeErrors: candidateErrors,
    behaviorallyEquivalent:
      agreements === RANDOM_SCENARIOS.length &&
      fixtureMatches === fixtures.length,
    disagreements,
    structurallyIdentical: JSON.stringify(ast) === JSON.stringify(item.ast),
  };
}

// ---------------------------------------------------------------------------
// Flow B: an LLM writes the assembly plan; Jev still fills every hole.
// ---------------------------------------------------------------------------

const PLAN_INSTRUCTION = `You design the assembly plan for a rule compiler. A separate decision model will fill one hole of a rule expression tree at a time, choosing from the menus you allow. You never write the tree and you never see the drawn numbers.

Read the player's rule proposal and return the narrowest menus that can still express it:
- allowedArrayKinds, allowedScalarKinds, allowedPredicateKinds: keep every construct the tree may need, including the ones needed by nested parts. Omitting a needed construct makes the rule impossible to assemble.
- allowedIntegers: every numeric constant the tree may need, including array positions and divisors.
- expectedResultType: "ranking" only when the proposal compares submitted tickets against each other.
- structureSummary: two or three sentences, in English, describing the intended structure of the tree for the decision model. Do not invent conditions the proposal does not state.`;

function planSchema() {
  return {
    type: "object",
    properties: {
      structureSummary: { type: "string" },
      expectedResultType: { type: "string", enum: ["predicate", "ranking"] },
      allowedArrayKinds: {
        type: "array",
        items: { type: "string", enum: Object.keys(ARRAY_KINDS) },
      },
      allowedScalarKinds: {
        type: "array",
        items: { type: "string", enum: Object.keys(SCALAR_KINDS) },
      },
      allowedPredicateKinds: {
        type: "array",
        items: { type: "string", enum: Object.keys(PREDICATE_KINDS) },
      },
      allowedIntegers: { type: "array", items: { type: "integer" } },
    },
    required: [
      "structureSummary",
      "expectedResultType",
      "allowedArrayKinds",
      "allowedScalarKinds",
      "allowedPredicateKinds",
      "allowedIntegers",
    ],
    additionalProperties: false,
  };
}

// Exact JSON shape of every construct, generated from the catalog so a prompt
// describing the grammar can never drift from the assembler's own definition.
const ENUM_FIELD = {
  source_side: "source",
  sort_order: "order",
  digits_place: "place",
  slice_start: "start",
  slice_end: "end",
  reduce_op: "op",
  arith_op: "op",
  compare_op: "op",
  at_index: "index",
  elem_up: "up",
  pair_side: "side",
  lit_value: "value",
};

function constructSignatures() {
  const output = {};
  for (const [type, catalog] of Object.entries(CATALOG)) {
    output[type] = {};
    for (const [kind, entry] of Object.entries(catalog)) {
      const names = entry.enums ?? [];
      const params = {};
      for (const name of names) {
        params[name] =
          name === "lit_value"
            ? 0
            : decodeEnum(name, Object.keys(ENUM_QUESTIONS[name].options)[0]);
      }
      const built = entry.build(params);
      const holeType = new Map(
        built.holes.map(([field, fieldType]) => [
          Array.isArray(field) ? field[0] : field,
          fieldType,
        ]),
      );
      const shape = {};
      for (const [field, value] of Object.entries(built.node)) {
        if (value === null) shape[field] = `<${holeType.get(field)}>`;
        else if (Array.isArray(value)) {
          shape[field] = [`<${holeType.get(field)}>`, "... 2 to 4 entries"];
        } else shape[field] = value;
      }
      for (const name of names) {
        const field = ENUM_FIELD[name];
        if (!field || !(field in shape)) continue;
        shape[field] =
          name === "lit_value"
            ? "<integer>"
            : `<${Object.keys(ENUM_QUESTIONS[name].options).join("|")}>`;
      }
      output[type][kind] = { shape, doc: entry.doc };
    }
  }
  // Optional fields the first-option build leaves out.
  output.array.slice.shape.end = "<integer, optional, exclusive>";
  output.scalar.elem.shape.up =
    "<0 or 1, optional, 1 means the enclosing scope>";
  return output;
}

function vocabulary() {
  return Object.fromEntries(
    Object.entries(CATALOG).map(([type, catalog]) => [
      type,
      Object.fromEntries(
        Object.entries(catalog).map(([kind, entry]) => [kind, entry.doc]),
      ),
    ]),
  );
}

async function requestPlan(proposal) {
  const model =
    configuredValue("LLM_MODEL_COMPILE", false) ??
    configuredValue("LLM_MODEL_INTERPRET", false) ??
    configuredValue("LLM_MODEL");
  const started = performance.now();
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${openRouterKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PLAN_INSTRUCTION },
          {
            role: "user",
            content: JSON.stringify({
              gameDomain: GAME_DOMAIN,
              nodeVocabulary: vocabulary(),
              ruleProposal: proposal,
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "assembly_plan",
            strict: true,
            schema: planSchema(),
          },
        },
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `LLM HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `LLM returned no plan text (finish reason: ${body.choices?.[0]?.finish_reason ?? "missing"})`,
    );
  }
  return {
    plan: JSON.parse(content),
    model: body.model ?? model,
    latencyMs: Math.round(performance.now() - started),
    usage: body.usage ?? null,
    costUsd: body.usage?.cost ?? null,
  };
}

const TERMINATORS = { array: "source", scalar: "lit", predicate: "compare" };

function planNarrower(plan, notes) {
  const allowed = {
    array: new Set(plan.allowedArrayKinds),
    scalar: new Set(plan.allowedScalarKinds),
    predicate: new Set(plan.allowedPredicateKinds),
  };
  for (const [type, terminator] of Object.entries(TERMINATORS)) {
    if (!allowed[type].has(terminator)) {
      allowed[type].add(terminator);
      notes.push(
        `added the terminating construct \`${terminator}\` to the ${type} menu`,
      );
    }
  }
  return (hole, kinds) => {
    const narrowed = kinds.filter((kind) => allowed[hole.type].has(kind));
    if (narrowed.length === 0) {
      notes.push(
        `plan left no legal option at ${hole.path}; fell back to the full menu`,
      );
      return kinds;
    }
    return narrowed;
  };
}

// ---------------------------------------------------------------------------
// Runners.
// ---------------------------------------------------------------------------

async function runGeneric(item) {
  const telemetry = createTelemetry();
  const menus = { integers: integerMenu(item.proposal) };
  const decider = createJevDecider(item.proposal, null, telemetry);
  const assembled = await assemble(item.proposal, decider, menus, null);
  return {
    flow: "generic",
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
    integerMenu: menus.integers,
    ...assembled,
    jev: {
      calls: telemetry.calls,
      summedLatencyMs: telemetry.latencyMs,
      costUsd: telemetry.costUsd,
      model: telemetry.model,
    },
    llm: null,
    score: assembled.ast ? scoreCandidate(item, assembled.ast) : null,
  };
}

async function runPlanned(item) {
  const telemetry = createTelemetry();
  const notes = [];
  let planned;
  try {
    planned = await requestPlan(item.proposal);
  } catch (error) {
    return {
      flow: "planned",
      ruleId: item.id,
      tier: item.tier,
      language: item.language,
      proposal: item.proposal,
      status: `PLAN_ERROR: ${error.message}`,
      steps: [],
      score: null,
      jev: { calls: 0, summedLatencyMs: 0, costUsd: 0, model: null },
      llm: null,
    };
  }
  const menus = {
    integers:
      planned.plan.allowedIntegers.length > 0
        ? [
            ...new Set(
              planned.plan.allowedIntegers.filter((v) => Number.isInteger(v)),
            ),
          ]
            .sort((a, b) => a - b)
            .slice(0, 18)
        : integerMenu(item.proposal),
  };
  if (planned.plan.allowedIntegers.length === 0) {
    notes.push(
      "plan listed no integers; fell back to the generic integer menu",
    );
  }
  const guidance = {
    intended_structure: planned.plan.structureSummary,
    expected_result_type: planned.plan.expectedResultType,
  };
  const decider = createJevDecider(item.proposal, guidance, telemetry);
  const assembled = await assemble(
    item.proposal,
    decider,
    menus,
    planNarrower(planned.plan, notes),
  );
  return {
    flow: "planned",
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
    integerMenu: menus.integers,
    plan: planned.plan,
    planNotes: notes,
    ...assembled,
    jev: {
      calls: telemetry.calls,
      summedLatencyMs: telemetry.latencyMs,
      costUsd: telemetry.costUsd,
      model: telemetry.model,
    },
    llm: {
      model: planned.model,
      latencyMs: planned.latencyMs,
      usage: planned.usage,
      costUsd: planned.costUsd,
    },
    score: assembled.ast ? scoreCandidate(item, assembled.ast) : null,
  };
}

async function runSelfTest(item) {
  const menus = { integers: integerMenu(item.proposal) };
  if (item.ast.schemaVersion !== 3) {
    return { ruleId: item.id, skipped: "reference AST is not schemaVersion 3" };
  }
  try {
    const assembled = await assemble(
      item.proposal,
      createOracleDecider(item.ast),
      menus,
      null,
    );
    const score = assembled.ast ? scoreCandidate(item, assembled.ast) : null;
    return {
      ruleId: item.id,
      status: assembled.status,
      steps: assembled.steps.length,
      reachable: Boolean(score?.structurallyIdentical),
      integerMenuCoversLiterals: score ? score.schemaValid : false,
    };
  } catch (error) {
    return { ruleId: item.id, status: "UNREACHABLE", error: error.message };
  }
}

async function mapConcurrent(items, concurrency, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return output;
}

function summarize(runs) {
  const complete = runs.filter((run) => run.status === "COMPLETE");
  const scored = complete.filter((run) => run.score);
  const valid = scored.filter((run) => run.score.schemaValid);
  const equivalent = valid.filter((run) => run.score.behaviorallyEquivalent);
  const fixtureExact = valid.filter((run) => run.score.fixtureExact);
  const decisionSteps = runs.flatMap((run) =>
    (run.steps ?? []).filter((step) => !step.forced),
  );
  return {
    rules: runs.length,
    completed: complete.length,
    schemaValid: valid.length,
    fixtureExact: fixtureExact.length,
    behaviorallyEquivalent: equivalent.length,
    structurallyIdentical: valid.filter(
      (run) => run.score.structurallyIdentical,
    ).length,
    meanRandomAgreement: valid.length
      ? valid.reduce((total, run) => total + run.score.randomAgreement, 0) /
        valid.length
      : null,
    jevDecisionSteps: decisionSteps.length,
    forcedSteps: runs.reduce((total, run) => total + (run.forcedSteps ?? 0), 0),
    jevCalls: runs.reduce((total, run) => total + (run.jev?.calls ?? 0), 0),
    jevCostUsd: runs.reduce((total, run) => total + (run.jev?.costUsd ?? 0), 0),
    llmCostUsd: runs.reduce((total, run) => total + (run.llm?.costUsd ?? 0), 0),
    summedProviderLatencyMs: runs.reduce(
      (total, run) =>
        total + (run.jev?.summedLatencyMs ?? 0) + (run.llm?.latencyMs ?? 0),
      0,
    ),
    byTier: Object.fromEntries(
      ["simple", "medium", "complex"].map((tier) => {
        const tierRuns = runs.filter((run) => run.tier === tier);
        const tierValid = tierRuns.filter((run) => run.score?.schemaValid);
        return [
          tier,
          {
            rules: tierRuns.length,
            schemaValid: tierValid.length,
            behaviorallyEquivalent: tierValid.filter(
              (run) => run.score.behaviorallyEquivalent,
            ).length,
          },
        ];
      }),
    ),
  };
}

function compactRow(run) {
  return {
    rule: run.ruleId,
    tier: run.tier,
    status: run.status.startsWith("COMPLETE") ? "complete" : run.status,
    steps: run.steps?.length ?? 0,
    schema: run.score ? (run.score.schemaValid ? "valid" : "invalid") : "-",
    fixtures: run.score?.schemaValid
      ? `${run.score.fixtureMatches}/${run.score.fixtureTotal}`
      : "-",
    random: run.score?.schemaValid
      ? `${(run.score.randomAgreement * 100).toFixed(1)}%`
      : "-",
    equivalent: run.score?.behaviorallyEquivalent ? "yes" : "no",
  };
}

async function main() {
  const flag = (name, fallback) => {
    const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : fallback;
  };
  const ids = flag("ids", null);
  const selected = ids
    ? benchmark.filter((item) => ids.split(",").includes(item.id))
    : benchmark;
  if (selected.length === 0) throw new Error("no benchmark rule matched --ids");

  if (process.argv.includes("--self-test")) {
    const results = [];
    for (const item of selected) results.push(await runSelfTest(item));
    console.log(JSON.stringify({ selfTest: results }, null, 2));
    return;
  }

  const flow = flag("flow", "both");
  const concurrency = Number(flag("concurrency", "4"));
  const output = flag("output", null);
  const wallStarted = performance.now();
  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      jevModel: "~typesafe/jev-latest",
      grammar: "schemaVersion 3 compositional core",
      optionSource:
        "generic: every construct the schema allows at the hole. planned: that set narrowed by an LLM-written plan.",
      randomEquivalenceScenarios: RANDOM_SCENARIOS.length,
      note: "Reference ASTs are hidden oracles used only to score finished candidates.",
    },
    flows: {},
  };

  if (flow === "generic" || flow === "both") {
    const runs = await mapConcurrent(selected, concurrency, runGeneric);
    report.flows.generic = { summary: summarize(runs), runs };
    console.log("\ngeneric flow");
    console.table(runs.map(compactRow));
  }
  if (flow === "planned" || flow === "both") {
    const runs = await mapConcurrent(selected, concurrency, runPlanned);
    report.flows.planned = { summary: summarize(runs), runs };
    console.log("\nplanned flow");
    console.table(runs.map(compactRow));
  }
  report.endToEndWallClockMs = Math.round(performance.now() - wallStarted);
  if (output)
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(report.flows).map(([name, value]) => [
          name,
          value.summary,
        ]),
      ),
      null,
      2,
    ),
  );
}

export {
  assemble,
  CATALOG,
  constructSignatures,
  createJevDecider,
  createOracleDecider,
  createTelemetry,
  GAME_DOMAIN,
  holeQuestions,
  integerMenu,
  legalKinds,
  planNarrower,
  PLAN_INSTRUCTION,
  randomScenarios,
  scoreCandidate,
  stateForHole,
  TERMINATORS,
  vocabulary,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
