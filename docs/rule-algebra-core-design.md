# Rule Algebra: Deterministic Probe Evidence and Orthogonal Core Design

This document delivers two things:

1. **Step 1 — Evidence**: a deterministic (LLM-free) probe of all 200 prompts in
   `docs/rule-proposal-prompt-test-set-2.md`, with every mismatch classified by
   root cause and mapped against the current AST grammar.
2. **Step 2 — Design**: an orthogonal compositional core (`schemaVersion: 3`)
   for the rule DSL that removes the "one specialized node / one regex per new
   phrasing" growth pattern and makes novel rules expressible without new code.

Context checked before creating this file:

- `PRD.md` was opened (§6.5 DSL/AST Rule Representation, §6.6 Vague Rule
  Rejection, §7 AI Rule Compiler / Runtime / Agent Harness, §7.5 Rule
  Compilation Flow, §7.8 Rule Test Harness).
- `.claude/skills` was reviewed; `packages/rule-compiler/rule-authoring/SKILL.md`
  was opened as the authoritative grammar reference.
- `packages/rule-compiler/src/index.ts`, `apps/api/src/index.ts`
  (`createRulePreflight`), `packages/agent-core/src/index.ts` (confidence), and
  `packages/rule-schema` were read as the code source of truth.
- `docs/rule-proposal-prompt-test-set-2.md` is the evaluated prompt set.

---

## Part 1 — Deterministic probe of test set 2

### Method

A probe script replicates the API pre-LLM gates from
`apps/api/src/index.ts#createRulePreflight` in the exact production order
(sanitize → `RULE_PREVENTED_PATTERNS` → `RULE_EXTERNAL_BLOCK_PATTERNS` →
`hasExternalDependency` → `hasInvalidConstraint` → token/byte limits) and then
runs the offline deterministic compiler
(`validateAndPrecompileRule` from `@idealer/rule-compiler`). No LLM is invoked,
so the run isolates harness logic from model behavior (same technique as the
test-set-1 probe).

Predicted outcome mapping:

| Predicted | Meaning |
|---|---|
| `BLOCK` | a deterministic pre-LLM gate throws, or the validator adds `EXTERNAL_DEPENDENCY` |
| `VALID` | the offline pattern compiler produced an accepted artifact |
| `CLARIFY` | validator flags `AMBIGUOUS_RULE` (no artifact) |
| `UNSUPPORTED` | no deterministic pattern matched — in production this case is delegated to the LLM compile path |

### Results (200 prompts)

| expected → predicted | count | Reading |
|---|---:|---|
| VALID → VALID | 48 | offline pattern compiler handles it end-to-end |
| VALID → UNSUPPORTED | 22 | depends entirely on the LLM path |
| VALID → CLARIFY | 2 | ambiguity heuristics overfire (#31, #142) |
| VALID → BLOCK | 2 | **false-positive text gates on legitimate rules** (#155, #179) |
| CLARIFY → CLARIFY | 21 | vague-word regex catches it deterministically |
| CLARIFY → UNSUPPORTED | 24 | vague vocabulary not in `AMBIGUOUS_PATTERNS`; relies on LLM to not hallucinate an interpretation |
| CLARIFY → BLOCK | 5 | refinement wording mentions a banned noun while *removing* it (#85, #154, #157, #175, #193) |
| BLOCK → BLOCK | 36 | deterministic block works |
| BLOCK → CLARIFY | 9 | ambiguity fires but external-dependency does not; reaches the LLM |
| BLOCK → UNSUPPORTED | 31 | **no deterministic gate fires; safety rests on the LLM/groundedness** |

### Headline finding: the algebra is NOT the gap in this set — but for a structural reason

Every one of the 26 `expected=VALID` prompts that the offline path failed is
**already expressible in the current schemaVersion-2 grammar**. The failures are
regex-parser coverage and text-gate false positives, not missing primitives:

| # | Prompt (short) | Expressible today via | Failure cause |
|---:|---|---|---|
| 31 | all six reversed positions match | `reversed_position_match_count_at_least(6)` | reverse-ambiguity heuristic overfires despite explicit "all six" |
| 32 | four of six reversed slots | `reversed_position_match_count_at_least(4)` | parser regex misses phrasing |
| 33 | exactly two picks miss the draw | `compare(count(difference(guess,draw)),eq,2)` | no parser for miss-count |
| 34 | span equals span | `reduce range_span` both sides | no parser |
| 35 | same count above 75 | `filter_compare(gt,75)` + count eq | no parser |
| 38 | sum at least ten lower | `compare(sum(g),lte,arith(sub,sum(d),10))` | no parser |
| 39 | three smallest sum higher | `sort`+`slice(0,3)`+`sum` | parser regex misses phrasing |
| 40 | biggest equals biggest | `compare(max(g),eq,max(d))` | parser regex misses phrasing |
| 41 | no even picks in draw | `count(intersection(filter_mod(g,2,0),d))==0` | no parser |
| 44 | fewer multiples of 10 | `filter_mod(10,0)` counts, `lt` | no parser |
| 45 | two middle numbers total | `sort`+`slice(2,4)`+`sum` | no parser |
| 47 | product of two smallest lower | `sort`+`slice(0,2)`+`reduce product` | no parser |
| 48 | exactly four below 50 | `count(filter_compare(lt,50))==4` | no parser |
| 49 | draw contains none of mine | `count(intersection)==0` | regex expects guess-side phrasing |
| 50 | positions 1,3,5 each higher | `and` of `at(i)` compares | no parser |
| 142 | "By close, mean every pick within 6..." | `all_ordered_abs_diff_lte(6)` | defined-objective exception misses this phrasing |
| 146 | draw has same 3-odd/3-even split | `filter_mod` counts on draw | context-dependent ("that same split") — single-prompt parser cannot resolve |
| 152 | sum at least 25 greater | `compare(sum(g),gte,arith(add,sum(d),25))` | no parser |
| 155 | "sunny" defined objectively | `and(count(filter_compare(d,gt,50))>=4, ...)` | **false-positive BLOCK: `weather/sunny` regex ignores that the player defined it numerically** |
| 158 | total same-position abs diff ≤ 28 | `total_ordered_abs_diff_lte(28)` — kind exists | parser regex misses phrasing |
| 163 | mirror positions 1↔6, 2↔5... | `reversed_position_match_count_at_least(6)` | parser regex misses phrasing |
| 176 | all picks inside draw min–max | `all_values_between_min_max` — kind exists | parser regex misses phrasing |
| 179 | "No admin step: five picks share last digit" | `digit_match_count_at_least(units,5)` | **false-positive BLOCK: `admin` regex fires on the word being negated** |
| 185 | remove lowest pick, sums equal | `remove_up_to_n(lowest,1)` + sum compare | parser only covers "highest" variant |
| 188 | two largest picks total more | `sort desc`+`slice(0,2)`+`sum` | parser regex misses phrasing |
| 194 | first three picks sum to last three drawn | `slice(g,0,3)` vs `slice(d,3)` | parser only matches same-side slices |

**Caveat that matters:** test set 2 was authored against
`rule-authoring/references/examples.md`, i.e. it was *designed to be
expressible*. It therefore cannot surface missing primitives by construction.
What it does prove:

1. **The offline deterministic layer scales by regex-per-phrasing.** 48/74
   VALID prompts compile offline; each of the 26 gaps would need yet another
   `parse*` function. This is the O(new code per new phrasing) growth pattern.
2. **Text-level gates misfire in both directions.**
   - False positives: #155 and #179 are *legitimate, compilable* rules blocked
     before payment because a banned noun appears in a defining or negating
     clause. Sequence refinements (#85, #154, #157, #175, #193) are blocked for
     mentioning the thing being removed ("no weather", "ignore wallet
     history").
   - False negatives: 31 of 71 expected-BLOCK prompts pass every deterministic
     gate and reach the LLM (`UNSUPPORTED`), where blocking depends on model
     judgment plus the groundedness check — not on anything deterministic.
3. **The v2 grammar accreted 8+ specialized predicate kinds**
   (`all_ordered_abs_diff_lte`, `total_ordered_abs_diff_lte`,
   `ordered_position_match_count_eq`, `ordered_position_compare_count_eq`,
   `value_within_any_count_at_least`, `digit_match_count_at_least`,
   `all_values_between_min_max`, `reversed_position_match_count_at_least`) —
   each added for one prompt family, each requiring schema + runtime + skill +
   parser + tests. A prompt family the sets don't cover yet ("at least four
   picks within 3 of the same-slot drawn number") is **not expressible today**
   and would require a ninth kind.

### Where the grammar actually runs out

Concrete player-plausible rules the v2 grammar cannot express (no combination
of current kinds produces them):

| Rule | Why v2 fails |
|---|---|
| "At least four picks within 3 of the drawn number in the same slot" | `all_ordered_abs_diff_lte` is all-or-nothing; `value_within_any_count_at_least` is any-slot. No *count* of same-position near-matches. |
| "No two of my picks are within 5 of each other" | no way to relate elements of the same array pairwise |
| "My picks include (at least) three consecutive numbers" | no adjacent-difference construct |
| "Every pick beats the same-slot drawn number by at least 5" | `all_ordered_compare` takes a raw op only; workaround via `map_arithmetic(draw,add,5)` exists for this one, but not for per-pair compound conditions in general |
| "More even numbers in my first half than my second half" | expressible only by chaining 4 nodes the LLM must invent; and any variant ("more primes", "bigger gap") needs new filters |

Each of these is one small composition away in an orthogonal algebra — and a
new schema node + runtime case + skill bullet + parser in the current one.

---

## Part 2 — Orthogonal core design (`schemaVersion: 3`)

### Design goals

Per PRD §6.5 the DSL must stay versioned, serializable, hashable, testable,
executable by `rule-runtime`, reject unknown nodes, and reject over-complex
trees. The core adds one requirement:

> **Closure under composition.** Any rule whose meaning is a total,
> deterministic function of `guess` and `draw` and fits the complexity budget
> should be expressible by *composing* core nodes — never by *adding* nodes.

Principles:

- Small orthogonal node set; every v2 specialized kind becomes a **macro**
  (a documented desugaring), not a runtime case.
- Totality by construction: no partial operations, no recursion, no unbounded
  loops. Arrays are bounded (sources have 6 elements; every operator preserves
  or shrinks length), so nested quantifiers are ≤ 6×6 evaluations.
- Same safety envelope: `MAX_AST_DEPTH`, complexity budget, Monte-Carlo test
  harness (§7.8) and difficulty classifier operate unchanged — evaluation is
  still a pure function of `(guess, draw)`.

### Type system

Three sorts, as today: `array` (list of integers), `scalar` (integer),
`predicate` (boolean). New: **element scopes** introduced by binder nodes.
Instead of tuples or named variables, pairwise operators bind an implicit
`(left, right)` pair, and single-array binders bind an implicit element, with
one level of outer reference (`up: 1`) for cross-array quantification. Binder
nesting depth is capped at 2 — enough for "for each of my picks, does any
drawn number ..." and statically checkable.

### Node grammar

Array nodes:

```
{"kind":"source","source":"guess"|"draw"}
{"kind":"sort","order":"asc"|"desc","of":<array>}
{"kind":"reverse","of":<array>}
{"kind":"slice","start":<int>,"end":<int?>,"of":<array>}      // negative end = from end
{"kind":"distinct","of":<array>}
{"kind":"intersection"|"difference","left":<array>,"right":<array>}
{"kind":"digits","place":"units"|"tens","of":<array>}
{"kind":"map","of":<array>,"expr":<elem-scalar>}               // binds elem
{"kind":"filter","of":<array>,"where":<elem-predicate>}        // binds elem
{"kind":"pairs_map","left":<array>,"right":<array>,"expr":<pair-scalar>}   // binds (left,right), length = min
```

Scalar nodes:

```
{"kind":"lit","value":<int>}
{"kind":"reduce","op":"sum"|"product"|"count"|"min"|"max"|"range_span","of":<array>}
{"kind":"at","index":<int>,"of":<array>}
{"kind":"arith","op":"add"|"sub"|"mul"|"div"|"mod","left":<scalar>,"right":<scalar>}
{"kind":"abs","of":<scalar>}
{"kind":"ite","if":<predicate>,"then":<scalar>,"else":<scalar>}
{"kind":"elem","up":0|1}            // inside map/filter/forall/exists scope
{"kind":"pair","side":"left"|"right"} // inside pairs_* scope
```

Predicate nodes:

```
{"kind":"compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","left":<scalar>,"right":<scalar>}
{"kind":"contains","array":<array>,"value":<scalar>}
{"kind":"forall","of":<array>,"where":<elem-predicate>}
{"kind":"exists","of":<array>,"where":<elem-predicate>}
{"kind":"pairs_forall","left":<array>,"right":<array>,"where":<pair-predicate>}
{"kind":"pairs_exists","left":<array>,"right":<array>,"where":<pair-predicate>}
{"kind":"and"|"or","clauses":[<predicate>,...]}
{"kind":"not","clause":<predicate>}
```

Top level unchanged: `{"schemaVersion":3,"result":{"type":"predicate"|"ranking",...}}` —
ranking keeps `direction` + `tieBreak` + a core `<scalar>` score.

Totality rules (documented algebraic conventions, statically enforced where
possible — never silent runtime fallbacks):

- `div`/`mod`: the right operand must be a non-zero literal or an element
  reference (element values are always 1–100, hence non-zero). A computed
  divisor that cannot be proven non-zero is a **schema rejection**, not a
  runtime special case.
- `at` with an index outside the (statically known maximum) array length is a
  schema rejection; runtime length shrinkage (post-`filter`) makes `at` on a
  filtered array a schema rejection too — use `sort`+`slice`+`reduce` instead.
- `reduce(min|max|range_span)` and `product` on a possibly-empty array (result
  of `filter`/`intersection`/`difference`) are defined: `min/max/span` of empty
  = predicate-context false via a documented `empty → comparison is false`
  rule; `sum`/`count` of empty = 0; `product` of empty = 1. These are the
  standard identities, stated in the spec and covered by dedicated tests.

Bounds: binder depth ≤ 2; `MAX_AST_DEPTH` and the existing node-count
complexity budget unchanged. Worst-case evaluation is ≤ 36 element visits per
quantifier pair — strictly bounded.

### Every v2 kind is a macro

| v2 kind | Core desugaring |
|---|---|
| `match_count_at_least(n)` | `compare(count(intersection(g,d)), gte, n)` |
| `sum_equals` | `compare(sum(g), eq, sum(d))` |
| `ordered_exact` / `all_equal_ordered` | `pairs_forall(g, d, pair.left == pair.right)` |
| `all_ordered_compare(op)` | `pairs_forall(g, d, left op right)` |
| `all_ordered_abs_diff_lte(v)` | `pairs_forall(g, d, abs(left − right) ≤ v)` |
| `total_ordered_abs_diff_lte(v)` | `compare(sum(pairs_map(g, d, abs(left − right))), lte, v)` |
| `ordered_position_match_count_eq(v)` | `compare(sum(pairs_map(g, d, ite(left == right, 1, 0))), eq, v)` |
| `ordered_position_compare_count_eq(op,v)` | same shape with `left op right` |
| `reversed_position_match_count_at_least(v)` | `compare(sum(pairs_map(g, reverse(d), ite(left == right, 1, 0))), gte, v)` |
| `value_within_any_count_at_least(dist,v)` | `compare(count(filter(g, exists(d, abs(elem(up:1) − elem) ≤ dist))), gte, v)` |
| `digit_match_count_at_least(place,v)` | `compare(count(filter(digits(g,place), contains(digits(d,place), elem))), gte, v)` |
| `all_values_between_min_max` | `forall(g, elem ≥ min(range) AND elem ≤ max(range))` |
| `count_at_least(v)` | `compare(count(of), gte, v)` |
| `filter_compare(op,v)` | `filter(of, elem op v)` |
| `filter_mod(m,r)` | `filter(of, (elem mod m) == r)` |
| `map_arithmetic(op,k)` | `map(of, elem op k)` |
| `map_with_guard(..., drop)` | `filter(map(of, expr), min ≤ elem ≤ max)` |
| `map_with_guard(..., keep_original)` | `map(of, ite(min ≤ mapped ≤ max, mapped, elem))` |
| `remove_up_to_n(lowest,n)` | `slice(sort(of,asc), n)` |
| `remove_up_to_n(highest,n)` | `slice(sort(of,asc), 0, −n)` |
| `remove_up_to_n(first,n)` | `slice(of, n)` |

The desugarings are executable: a `desugarV2(ast)` function in `rule-schema`
turns any v2 artifact into core form, and property tests assert
`evaluateV2(ast, g, d) === evaluateCore(desugarV2(ast), g, d)` over the
Monte-Carlo sample space of the existing test harness.

### What becomes expressible with zero new code

The gap list from Part 1, in core form:

- *"At least four picks within 3 of the same-slot drawn number"* →
  `compare(sum(pairs_map(g, d, ite(abs(left−right) ≤ 3, 1, 0))), gte, 4)`
- *"No two of my picks are within 5 of each other"* →
  `pairs_forall(slice(sort(g,asc),0,−1), slice(sort(g,asc),1), right − left ≥ 5)`
  (adjacent pairs of the sorted ticket — the shifted-zip idiom)
- *"My picks include consecutive numbers"* →
  `pairs_exists(slice(sort(g,asc),0,−1), slice(sort(g,asc),1), right − left == 1)`
- *"Every pick beats its slot by at least 5"* →
  `pairs_forall(g, d, left ≥ right + 5)`
- *"More even numbers in my first half than my second half"* →
  `compare(count(filter(slice(g,0,3), elem mod 2 == 0)), gt, count(filter(slice(g,3), elem mod 2 == 0)))`
- *"The units digits of my ticket sum to more than the draw's"* →
  `compare(sum(digits(g,units)), gt, sum(digits(d,units)))`

None of these exist in any test set yet — which is exactly the point: the
space of "inédito" rules is covered by composition, not by anticipating
phrasings.

### Consequences for the rest of the pipeline

- **Runtime (`rule-runtime`)**: implements ~18 orthogonal cases instead of 25+
  specialized ones. The v2 evaluator is kept as-is so frozen artifacts replay
  byte-identically (auditability); v3 is additive. New rules compile to v3.
- **Compiler (`rule-compiler`)**: `compileSupportedRule` regexes stay as an
  optional deterministic fast path but stop being a growth surface — new
  phrasings ride the LLM path with the compositional grammar. The
  skill/constrained-decoding JSON schema shrinks to the core node set.
- **Skill (`rule-authoring/SKILL.md`)**: the grammar section becomes the core
  list plus a macro cookbook (the desugaring table above), which is *smaller*
  prompt surface than today's per-kind enumeration and teaches the model to
  compose instead of pattern-match.
- **Reviewer**: `knownAstSemanticsMatch` (structural signatures) cannot judge
  novel compositions. The follow-up (step 3, out of scope here) replaces it
  with sampled semantic equivalence using the existing Monte-Carlo harness:
  compile with two independent models, accept when both ASTs agree on all
  sampled `(guess, draw)` pairs.
- **Text gates**: unchanged by this design, but Part 1 documents their false
  positives (#155, #179, sequence refinements) and false negatives (31
  BLOCK→UNSUPPORTED). Judging compiled ASTs (which structurally *cannot*
  reference anything but guess/draw) plus the groundedness check is the
  systematic fix; the regex layer should remain only as a cheap pre-LLM cost
  saver.

### Suggested implementation order

1. `rule-schema`: v3 node types + zod schema + static totality checks + binder
   depth check (additive; v1/v2 untouched).
2. `rule-runtime`: core evaluator + totality/identity unit tests
   (empty-array identities, div/mod restrictions, binder scoping).
3. `rule-schema`: `desugarV2` + harness-driven property equivalence tests
   (v2 evaluator vs desugared core, full Monte-Carlo sample).
4. `rule-compiler`: emit v3 from the LLM path (constrained decoding schema),
   keep offline regex fast path emitting v2 (desugared on acceptance).
5. `rule-authoring/SKILL.md` + `references/*`: rewrite grammar section around
   the core + macro cookbook; add the "shifted-zip", "counted pairs", and
   "digit aggregation" idioms to `patterns.md`.
6. Re-run test sets 1 and 2 probes + the full `node --test` suites as the
   regression gate.

---

## Implementation status (2026-07-05)

All six steps above are implemented and verified:

1. `rule-schema`: v3 node types + zod schema + static totality checks (binder
   scope/depth ≤ 2, statically-safe `at`, literal-divisor checks) shipped;
   `CURRENT_SCHEMA_VERSION = 3`. Note: `x div 0 = 0` / `x mod m≤0 = 0` were kept
   as documented algebraic identities (matching the v2 runtime) instead of a
   computed-divisor schema rejection, so `desugarV2` is total over the v2 space
   and property equivalence holds exactly.
2. `rule-runtime`: v3 core evaluator with binder frames + WeakMap-cached AST
   validation (frozen artifacts validate once, then evaluate parse-free).
3. `rule-schema/desugar.ts` (`desugarToV3`): every v1/v2 kind desugars; a
   Monte-Carlo property suite in `rule-runtime` asserts v2-vs-desugared
   agreement (27 predicate + 2 ranking catalog entries × 300 seeded samples).
4. `rule-compiler`: constrained decoding now emits the v3 JSON schema; the
   reviewer uses structural signatures as fast path plus seeded sampled
   semantic equivalence for cross-version/novel compositions; artifacts carry
   `schemaVersion: 1 | 2 | 3`. Offline regex fast path still emits v1/v2
   (valid + executable) and is no longer a growth surface.
5. Skill rewritten around the core grammar + macro cookbook + idioms
   (`idealer_rule_compiler_skill_v6`); every worked example is validated
   against the schema by a compiler test.
6. Text gates: dismissal-clause/simile/objective-clarification-aware external
   matching (compiler + API preflight share `externalDependencyGateText`);
   weather regex narrowed; expanded vague-vocabulary CLARIFY patterns;
   defined-objective exception broadened. Probe results after implementation:
   **zero hard mismatches on both test sets** (set 2: VALID offline 48→53,
   VALID→BLOCK 2→0, CLARIFY deterministic 21→43, CLARIFY→BLOCK 5→0,
   BLOCK deterministic 36→38). The 31 BLOCK→LLM prompts remain covered by the
   structural guarantee that a v3 AST can only reference guess/draw, plus the
   groundedness check.

`PRD-eligibility-gate.md` also sketches a "schemaVersion 3" envelope
(`eligibilityGate` + `core`); that feature is unimplemented and its envelope
can ride v3 later as an optional field — flagged here to avoid version-number
collision when it lands.
