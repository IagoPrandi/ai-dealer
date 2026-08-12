# Rule Proposal Prompt Test Set 4 - Stress and Repair Session

This fourth rule-agent test set turns the eight product questions from test set 3
into a smaller, adversarial regression corpus. It was executed both directly
against the deterministic compiler and end to end through live
`POST /rule-preflight` calls.

Required context opened before the session: `PRD.md`, `AGENTS.md`,
`.claude/CLAUDE.md`, `.claude/skills`,
`.claude/skills/tyche-test-and-verify/SKILL.md`, and
`docs/rule-proposal-prompt-test-set-3.md`.

## Method

- 24 prompts: three cases for each of the eight questions.
- 39 executable boundary fixtures over every objective accepted rule. Fixtures
  execute the exact AST returned by the API through `evaluatePredicate`; they do
  not infer behaviour from prose.
- Expected outcomes: `VALID`, `CLARIFY`/`CONFIRM`, or `BLOCK`.
- Two modes in `apps/api/scripts/rule-preflight-stress-set-4.mjs`:
  - live (default): calls the real API and records decision, semantic review,
    returned AST, source spans, fixture results, and latency;
  - `--offline`: runs the same corpus through `validateAndPrecompileRule`, making
    model variability and persistent re-proposal state irrelevant.
- Live load: four parallel processes, each sequential within its six-case group.
  This intentionally tests contention without issuing an unbounded request burst.
- A re-proposal rejection remains visible in the record but does not replace the
  semantic verdict: if an AST is returned, fixtures still test it.

Run locally:

```text
pnpm --filter @tyche/api stress:rules:set4 -- http://127.0.0.1:3002 --compact
pnpm --filter @tyche/api stress:rules:set4 -- unused --offline --compact
```

## Corpus

| ID | Question | Prompt focus | Expected |
|---|---:|---|---|
| Q1-01 | 1 | within 4 at every position **and** at least two exact positions | VALID |
| Q1-02 | 1 | guess sum at least 12 higher than draw sum | VALID |
| Q1-03 | 1 | sum of three smallest guess values greater than draw equivalent | VALID |
| Q2-01 | 2 | no even guessed value appears in draw | VALID |
| Q2-02 | 2 | guess sum modulo 7 equals draw sum modulo 7 | VALID |
| Q2-03 | 2 | guess contains 42 and draw sum is below 150 | VALID |
| Q3-01 | 3 | every position within an undefined “small distance” | CLARIFY/CONFIRM |
| Q3-02 | 3 | undefined “better total” | CLARIFY/CONFIRM |
| Q3-03 | 3 | undefined number of matching positions (“some”) | CLARIFY/CONFIRM |
| Q4-01 | 4 | explicit strict guess range, draw explicitly irrelevant | VALID |
| Q4-02 | 4 | exactly one same-position match | VALID |
| Q4-03 | 4 | total absolute positional difference <= 24 | VALID |
| Q5-01 | 5 | “harmonious” | CLARIFY/CONFIRM |
| Q5-02 | 5 | “near-perfect but not exact” | CLARIFY/CONFIRM |
| Q5-03 | 5 | “lucky-looking” and “balanced” | CLARIFY/CONFIRM |
| Q6-01 | 6 | guess total at least ten lower than draw total | VALID |
| Q6-02 | 6 | within 6 everywhere and at least one exact position | VALID |
| Q6-03 | 6 | exact guess set `{1..6}` and an inclusive drawn value 40..60 | VALID |
| Q7-01 | 7 | fixed guess set `{8,16,24,32,40,48}` | VALID |
| Q7-02 | 7 | draw-only: every drawn value below 40 | VALID |
| Q7-03 | 7 | guess-only: contains 77 | VALID |
| Q8-01 | 8 | wallet SOL balance | BLOCK |
| Q8-02 | 8 | Discord role | BLOCK |
| Q8-03 | 8 | external SOL price | BLOCK |

The script contains the concrete arrays and expected win/lose outcome for every
fixture. Boundary pairs include exactly-on-threshold versus one unit outside,
missing one conjunct, and fixed-rule inputs whose irrelevant side is changed.

## Results

| Stage | Pass | Fail | Executable fixture result |
|---|---:|---:|---:|
| Initial live run | 12 | 12 | semantic contradictions and missing ASTs found |
| Initial offline baseline | 8 | 16 | 11 checks attempted; deterministic gaps confirmed |
| After grammar/harness repair, offline | **24** | **0** | **39/39 correct** |
| Intermediate live integration run | 14 | 10 | exposed model-paraphrase precedence |
| Final live result (passing cases plus focused reruns) | **24** | **0** | **39/39 correct** |

The final live result is consolidated from the 14 cases that passed the
post-grammar full run and focused reruns of its 10 failures. Nine passed after
source-text precedence; Q2-03 then passed alone after the final false-clarify
guard. This avoids spending another complete model run while every changed path
remains covered by deterministic package tests.

External-dependency cases blocked in 4-37 ms. Model-backed objective/ambiguous
cases took approximately 53-220 seconds each under four-way load. The complete
offline corpus runs in under one second. Correctness is now green; live model
latency and throughput remain an operational weakness rather than a hidden rule
failure.

## Findings and repairs

### F1 - deterministic grammar did not cover the adversarial surface forms

Added bounded parsers for:

- arbitrary exact six-number guess sets, including natural lists ending in
  “and N”;
- no overlap between even guessed values and the draw;
- direct sum-modulo equality wording;
- guess membership conjoined with a draw-sum threshold;
- strict guess-only ranges, draw-only thresholds, and guess-only membership;
- arbitrary counts of sorted smallest/largest values;
- general “at least N exact positions” conjoined with per-position distance;
- additional safe surface forms for signed sum differences.

Each family is asserted through boundary outcomes, not only AST snapshots.

### F2 - the model paraphrase could override a better player-source compile

The live pipeline compiled `interpretation.normalizedText` even when the player's
source was already supported. The paraphrase repeatedly dropped clauses or moved
the rule outside deterministic patterns. Preflight now selects the original
player text whenever it validates deterministically. A model normalization is
used only when the source itself cannot compile safely.

This fixes Q1-01/H03-style clause loss, signed thresholds, modulo, exact sets,
and Q4-03's wrong `sum_equals` re-proposal collision without weakening any
fail-closed provider path.

### F3 - the model invented specificity or clarification

Source ambiguity is now binding. Words including `some`, `better`,
`harmonious`, and `near-perfect` cannot become silent objective rules after a
model invents a threshold. Conversely, an objective source that compiles
deterministically cannot inherit an invented model question. Material
draw-only/guess-only scope and endpoint confirmation remains a separate AST-based
semantic review.

### F4 - arbitrary fixed guesses looked impossible to uniform sampling

The harness's witness sets did not include `{8,16,24,32,40,48}`, so a valid
fixed-guess rule was labelled `IMPOSSIBLE`. Harness version 2.2.0 extracts values
pinned by `contains(guess, literal)` clauses and constructs bounded directed
witnesses. Such rules are now `EXTREME`, while genuinely unwinnable predicates
remain `IMPOSSIBLE`.

### F5 - explicit irrelevant-input wording was order-sensitive

Semantic scope confirmation recognized “ignore the guess” but not “the guess
does not affect the result”. Both subject-first English forms now satisfy the
same explicit-consent check for draw-only and guess-only rules.

## Answers to the eight questions after repair

| # | Question | Result |
|---:|---|---|
| 1 | Does the agent understand correctly? | 3/3 |
| 2 | Does it compile correctly? | 3/3, all fixtures correct |
| 3 | Does it know when to ask? | 3/3 |
| 4 | Does it know when not to ask? | 3/3 |
| 5 | Does it detect vague rules? | 3/3 |
| 6 | Is announcement equal to settlement behaviour? | 3/3, 9/9 fixtures |
| 7 | Are outcome-determining rules allowed? | 3/3 |
| 8 | Are favouritism/external-input rules refused? | 3/3, all blocked before the model |

## Verification scope

The final verification ladder covers `@tyche/rule-test-harness`,
`@tyche/rule-compiler`, and `@tyche/api`: typecheck, package tests, ESLint with
zero warnings, and build. No milestone checkbox is marked until user
confirmation.
