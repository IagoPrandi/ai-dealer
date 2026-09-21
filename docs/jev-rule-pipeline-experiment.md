# Jev rule pipeline experiment

2026-09-20 to 2026-09-21. Source tree: `ced8ced` plus experimental scripts in
`apps/api/scripts/`. The live model resolved from OpenRouter's
`~typesafe/jev-latest` alias to `typesafe/jev-1.13-20260917`.

## What Jev can do here

Jev returns typed decisions and probabilities. It cannot write a rule AST or
explain its reasoning. Its [System One documentation](https://docs.typesafe.ai/concepts/system-one)
explicitly says group calibration does not guarantee that an individual decision
is right. Its [primitives documentation](https://docs.typesafe.ai/primitives)
distinguishes a Choice probability distribution from a Noul P(yes); Noul has no
separate confidence field. The [self-consistency cookbook](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook)
uses uncertain probability bands to route decisions to review rather than
claiming certainty. OpenRouter exposes the model through the
[Decisions endpoint](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request).
The documented alias with `~` works at this endpoint; `typesafe/jev-latest`
returned HTTP 400 (model does not exist) in the live probe.

The feasible pipeline is:

1. Screen the player's source text for the existing prohibited inputs and
   injection risks. Preserve the original text and the player's approved
   interpretation.
2. An LLM or a bounded grammar proposes _candidate_ parameter combinations.
   Jev can rank the available parameters with Choice and judge each completed
   candidate with Noul. A finite grammar can build simple ASTs directly; novel
   compositions still require an LLM candidate generator. Enumerating every
   recursive AST is not tractable.
3. If terms are missing, the LLM identifies candidate clarification categories.
   Jev's category probabilities can help prioritize questions, while the LLM
   must inspect the original text and ask the player. Do not discard a category
   solely because its Jev probability is low.
4. The selected AST must pass the existing schema, source coverage, runtime
   limits, behavior tests, independent review, and player approval. A Jev
   probability alone cannot authorize payment or freeze an artifact. When the
   candidate set is incomplete or independent checks disagree, abstain and
   escalate. The final validator and signed preflight hash remain authoritative.

## Reproduction

```powershell
node apps/api/scripts/jev-rule-probe.mjs
node apps/api/scripts/jev-rule-probe.mjs --clarification
node apps/api/scripts/jev-rule-composition.mjs --assert
node apps/api/scripts/jev-rule-composition.mjs --omit-correct --assert
node --import tsx apps/api/scripts/jev-rule-baseline.mjs set13-N1 set13-N2 set12-V1
node --import tsx apps/api/scripts/jev-rule-pipeline.mjs
node --import tsx apps/api/scripts/jev-rule-pipeline.mjs --dynamic-clarification set12-V1 pt-vague
```

The baseline command is the real, two-phase current pipeline and may take minutes.
The last two commands run the bounded Jev-first experimental flow, with the
final command enabling dynamic clarification. None submits a proposal. The Jev
commands make paid OpenRouter
requests. The API key is read from `API_KEY_OPENROUTER` or the root `.env`; no
secret is printed. The experiment scripts do not modify production decisions.
The dynamic clarification mode uses the configured `LLM_MODEL_COMPILE` for two
schema-constrained OpenRouter calls, with Jev scoring the LLM's proposed
categories between them.

The public prompts come from
[set 12](rule-proposal-prompt-test-set-12.md) and
[set 13](rule-proposal-prompt-test-set-13.md). The two AST families are a
ranking with an optional match-count eligibility gate and a Boolean formula
over a sum comparison and a drawn extremum. Their candidate spaces are fixed
_before_ Jev sees a prompt: 16 and 12 combinations respectively. Jev sees
only the player text and executable AST descriptions rendered by
`describeRuleAstForPlayers`; it does not see the expected parameters or behavior
fixtures. Fixture scores are used only for benchmark evaluation, never to select
a candidate.

## Live observations

| Check                     |                               Cases | Observation                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choice parameter probe    |         12 proposals, 6 fields each | The required route was correct for all 12, including three vague rules and a wallet-dependent rule. All 40 fields applicable after routing were correct. Six of 72 raw fields were wrong, in fields the conditional builder must ignore. |
| Complete AST selection    | 4 proposals, English and Portuguese | The highest Noul selected the sole behaviorally correct AST in each bounded candidate set. Ranking: 9/9 behavior fixtures. XOR: 8/8 fixtures. Observed winning Nouls ranged from 0.82 to 0.94.                                           |
| Missing-candidate control |                         4 proposals | When the behaviorally correct AST was removed, the highest Noul was at most 0.21 in the observed runs; the provisional 0.80 plus 0.20 gap rule abstained. These cutoffs are experimental, not calibrated release thresholds.             |
| Clarification categories  |                   4 vague proposals | Top-ranked categories exactly matched the expected category set in 2/4 cases. The other two missed a required category, so this signal cannot decide which questions are omitted.                                                        |

The Jev calls for the six-field probe cost roughly $0.000046-$0.000048 each
according to OpenRouter's returned `usage.cost`, with observed round trips of
about 0.3-0.7 s. Complete-candidate judging cost $0.00008526 (16 ASTs) and
$0.000063294 (12 ASTs) for the English prompts, in one request per rule. Those
are provider charges for the experiment, not the cost of a production pipeline
with LLM generation, review, user clarification, and deterministic validation.

The category probe is a measured weakness. On set-13 V1, Jev gave the
arithmetic-grouping category 0.49, tied with a reference-point category, and
the top-one selection missed grouping. On set-12 V2, threshold and reference
both scored 0.71 while quantifier scope scored 0.67, so a top-two selection
missed scope. An LLM must retain responsibility for generating the actual
question from the proposal and any previous player answers.

### Current pipeline comparison

| Proposal                                 | Current two-phase outcome                | Current wall time |     Known cost / total calls | Jev bounded path                                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------- | ----------------: | ---------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set 13 N1, ranking with two-match gate   | `INVALID`, `SECOND_OPINION_UNAVAILABLE`  |         209.469 s |  $0.01036597 across 12 calls | Selected the exact AST that the current compiler generated and then rejected, in one 16-candidate Jev call (0.469 s, $0.00008526); the facet call adds about 0.5 s and $0.000047.   |
| Set 13 N2, exactly one of two conditions | `VALID`, behaviorally equivalent XOR AST |         191.103 s | $0.007377982 across 10 calls | Selected the correct XOR AST in one 12-candidate Jev call (0.349 s, $0.000063294); the facet call adds about 0.4 s and $0.000047.                                                   |
| Set 12 V1, undefined closeness           | `CLARIFY`, two specific questions        |           4.980 s |   $0.00289568 across 3 calls | Jev identified clarification in about 0.4 s, but category ranking is not reliable enough to replace the LLM's questions. Adding Jev before the same LLM would add latency and cost. |

The current costs are **lower bounds**: the usage records did not price the
guardian calls (and N1 also had a failed reviewer call). The N1 rejection trace
contains one AST with the correct eligibility gate, range score, minimum direction and
shared ties, but marked it `PROVIDER_EVIDENCE_UNVERIFIED`; three other rejected
ASTs lacked the gate. This experiment proves the bounded Jev path can select
that candidate on this case. It does **not** establish that the same candidate
could bypass all existing validator gates safely, or that this grammar covers
other rules.

The Portuguese paraphrases received the same top ASTs, but the N1 route Choice
gave only 0.56 to `defined` and the completeness Noul was 0.64-0.69 in observed
runs. A strict route-confidence cutoff would therefore reject a valid Portuguese rule even
though its candidate AST scored 0.82 and passed 9/9 fixtures. This is a concrete
reason to calibrate by language and by stage before using any threshold for
automatic release.

### Orchestrated experimental path

The `jev-rule-pipeline.mjs` runner follows the decisions in order: Jev routes
the proposal; the two supported composition families enumerate valid ASTs; Jev
scores all candidates; the script reports schema validity and independent
behavior-fixture results. For a vague rule, the existing LLM interpreter writes
clarification questions, then Jev scores possible missing-information categories.
The category scores are advisory and do not delete the LLM's questions. For an
unsupported source, the script stops at a policy escalation. Every candidate
stops at `CANDIDATE_READY_FOR_EXISTING_VALIDATOR`, before the production
validator, player approval, payment, or artifact freeze.

| Experimental outcome              | Measured wall time | Known provider cost | Behavior check                                              |
| --------------------------------- | -----------------: | ------------------: | ----------------------------------------------------------- |
| English N1 candidate              |            0.986 s |        $0.000132678 | 9/9 fixtures                                                |
| English N2 candidate              |            0.739 s |        $0.000110544 | 8/8 fixtures                                                |
| Portuguese N1 candidate           |            0.677 s |        $0.000132342 | 9/9 fixtures                                                |
| Portuguese N2 candidate           |            0.768 s |        $0.000110376 | 8/8 fixtures                                                |
| English V1 asks player            |           23.882 s |        $0.001234132 | Questions retain the missing distance and scope             |
| Portuguese vague rule asks player |           21.430 s |        $0.001322519 | Questions retain the missing distance and comparison target |
| Wallet-dependent rule escalates   |            0.501 s |        $0.000045990 | No AST emitted                                              |

The two clarification costs are lower bounds because one and two LLM calls,
respectively, were unpriced in their usage records. The English V1 run was much
slower than its 4.980 s baseline even though the two Jev calls were short;
provider variability dominated that run. These numbers stop before existing
validator work and before a human answers a question. Time to a final submitted
rule is therefore **not measured** for the new path. The two grammar families
were deliberately designed around the test proposals, so their fast candidate
generation is not evidence of a general-purpose compiler.

### Dynamic LLM → Jev → LLM clarification

The requested three-stage clarification sequence was also run on one English
and one Portuguese vague proposal. The LLM first returned missing-information
categories, Jev assigned a Noul to each category, then the LLM wrote questions
using the category list and scores. The original text remained in every call.
This branch uses the currently configured stronger compile model
(`openai/gpt-oss-120b`) for both LLM steps. It is a separate model configuration
from the ordinary interpreter run above, so their cost and latency differences
cannot be attributed to Jev.

| Proposal              | Wall time |   Known cost | Quality finding                                                                                                                                                                                                        |
| --------------------- | --------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English V1            |  21.438 s | $0.000256891 | Asked four questions. The existing interpreter asked two in its separate baseline run; the dynamic path raised additional grouping and aggregation doubts that need human review before they are treated as necessary. |
| Portuguese vague rule |  23.887 s | $0.000236804 | Asked four questions. One repeats the definition of the remaining numbers in two equivalent ways, and none explicitly chooses same-position versus any-drawn-number proximity.                                         |

The first English run omitted fixed game-domain context. It asked whether
duplicate numbers are permitted, although both guess and draw always have six
distinct values; Jev scored that unnecessary category at **0.89**. Adding the
fixed domain removed this specific error in the next run. Jev still gave high
Nouls (0.89-0.96) to some debatable or redundant categories, so a high Noul is
not a reliable proof that a clarification question is needed. The branch keeps
all LLM-identified details instead of suppressing them by score. It rejects
empty, malformed, overlong, or invisible-character output explicitly.

Direct schema-constrained category calls to the configured lighter interpreter
returned no usable text and timed out on a retry. The stronger compile model
completed the experiment. This provider compatibility and latency difference
would need resolving before any production architecture choice.

The experimental runner does not execute the production policy screen before
Jev. Its wallet-dependent sample therefore demonstrates routing only; the
production policy gate must remain ahead of model decisions.

## AST doubt, improvement, and policy experiment

The additional read-only runner is
`apps/api/scripts/jev-rule-doubt-pipeline.mjs`. Run `node
apps/api/scripts/jev-rule-doubt-pipeline.mjs --screen-only` for the initial
Jev screen, or omit `--screen-only` for the full LLM/Jev chain. Named case IDs
limit the run. The full run sends the validated raw AST and its deterministic
English description alongside the original proposal. Jev returns a Choice
`yes`/`maybe`/`no` with the complete probability distribution and independent
Noul checks for nine policy categories. A policy hit (Noul at least 0.8) or
`no` stops the revision path. Policy hits carry a concrete player-facing
reason; the experiment does not rely on Jev for final policy authorization.

For `yes` or `maybe`, the configured compile LLM proposes up to four
improvements. A second Jev call judges each point on two **separate** axes:
whether the point is useful and whether the player's own text entails the
proposed choice. Both must be high (at least 0.8 and 0.9 respectively) before
the point can enter a revised draft. A useful point without source support
becomes a clarification question. While such a point is unresolved, the final
LLM must return the player's original proposal verbatim and formulate neutral
questions. Programmatic checks reject drift, unrecognized applied points,
missing questions, malformed output, leading yes/no questions, and internal
AST names in player-facing questions. A final Jev pass checks the draft against
the AST and policy again.
This remains a **draft**: the existing deterministic validator, guardian,
player confirmation, and artifact freeze are not bypassed.

The first live screen covered 14 distinct proposal/AST pairs: three complete
valid pairs (including Portuguese), two deliberately wrong ASTs, one AST that
omitted a vague proposal's second branch, three intentionally ambiguous
wordings, and five forbidden rules. Jev chose `yes` for all three complete
pairs and `no` for all three wrong/incomplete pairs. It identified the
expected forbidden category for all five wallet, time, votes, out-of-range,
and tautology rules. Some forbidden cases received overlapping policy labels.
The three ambiguous cases all received raw `yes`, **not** `maybe`. For the
unspecified threshold case the distribution was `yes: 0.47`, `maybe: 0.25`,
`no: 0.28` in one run and `yes: 0.49`, `maybe: 0.26`, `no: 0.25` in another.
Thus a top Choice label is not a reliable ambiguity gate in this sample.
With the final nine-category screen, calls took approximately 0.3-0.7 s and
cost about $0.000047-$0.000065 each. These are provider calls, not compilation
time. An earlier combined "non-executable" question falsely labeled the
wallet example and a first split missed the tautology. Focused questions
corrected those examples on rerun; this is not proof of policy-screen recall.

| Full-chain case                              | Final observed behavior                                                                           | Wall time | Known provider cost |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------: | ------------------: |
| Complete ranking N1, first version           | LLM suggested a no-winner clause; Jev rejected it and the text stayed verbatim                    |  12.547 s |        $0.000233815 |
| Complete XOR N2, first version               | No improvement points; text stayed verbatim                                                       |   5.607 s |        $0.000328512 |
| Ambiguous "closest together", first version  | **Unsafe:** Jev accepted an invented tie payout (Noul 0.8); draft changed without player evidence |  23.002 s |        $0.000301445 |
| Same ambiguous case, split support test      | Rejected the invented choice, but a 0.8 usefulness cutoff missed some questions on a repeat       |   8.180 s |        $0.000216382 |
| Same ambiguous case, revised cutoff          | Preserved the original and asked about ties/no eligible ticket                                    |  12.764 s |        $0.000246900 |
| Unspecified "enough" threshold, final prompt | Preserved the original and asked for the match threshold, tie behavior, and no-eligible outcome   |  10.469 s |        $0.000322794 |
| Same threshold, nine policy questions        | Preserved the original and asked neutral questions about the match threshold and ties             |  13.221 s |        $0.000570342 |

The earlier full-chain rows used fewer policy questions; the last row uses the
final nine-category screen and open-question guard. Provider response length
and latency also varied between runs, so the table is not a controlled
per-stage speed comparison. The original single-Noul design conflated "useful" with "authorized by the
player". Its tie-payout error is the concrete safety regression that motivated
the split. The final run exposed another quality issue: questions about a
no-eligible-tickets outcome may be unnecessary or outside the winning-rule AST
scope. The LLM also sometimes omits the ambiguous definition of "closest
together". These errors vary between repeat runs. The experiment cannot
claim a general accuracy gain or a calibrated threshold from this small,
hand-selected set. It contains no observed top-label `maybe` case, so that
branch remains unmeasured. Player response time, bounded candidate
generation, production validation, and official submission are excluded from
the timings and costs. The full doubt chain takes two LLM calls plus two or
three Jev calls and is much slower than the Jev-only screen; its prices here
are directly reported provider charges, with no unpriced call in these runs.

## Structural fit followed by strict source fidelity

The owner clarified the intended role of the first Jev question: identify
whether an AST has the **same main rule mechanism**, even if the AST makes a
plausible operational choice that the player has not yet approved. The new
read-only `apps/api/scripts/jev-rule-fidelity-probe.mjs` tests that structural
Choice and a separate strict comparison. It sends the raw AST, its readable
description, the player's text, and AST facts to Jev. In one batched request it
asks two directions of fidelity using **both** a binary Choice and a Noul:

1. Does the player text support every material executable AST condition?
2. Does the AST cover every material winning condition in the player text?

Ranking ASTs also get one Noul per clause: eligibility, score, and tie rule.
The exploratory acceptance rule requires structural `yes` with both its
probability and Choice confidence at least 0.7, both strict Nouls at least
0.7, and every available clause Noul at least 0.9. These cutoffs are study
parameters, not calibrated safety guarantees. [TypeSafe's primitive
documentation](https://docs.typesafe.ai/primitives) defines Choice confidence
as distribution concentration; Noul has no separate confidence field.

The final structural-question run used nine known candidate/proposal pairs.
Values below are from **one** live run; repeat runs varied. `AST Choice` shows
the selected option, its probability, then confidence. `Min fact` is the
lowest available per-clause Noul.

| Case                         | Structure Choice (P / confidence) | AST-supported Noul | AST Choice (P / confidence) | Proposal-covered Noul | Min fact |
| ---------------------------- | --------------------------------- | -----------------: | --------------------------- | --------------------: | -------: |
| Complete ranking             | yes (1.00 / 1.00)                 |               0.94 | yes (0.85 / 0.70)           |                  0.95 |     0.97 |
| Complete XOR                 | yes (0.98 / 0.97)                 |               0.91 | yes (0.97 / 0.95)           |                  0.93 |        — |
| Complete ranking, Portuguese | yes (1.00 / 0.99)                 |               0.86 | yes (0.72 / 0.44)           |                  0.91 |     0.94 |
| “Closest together”           | yes (1.00 / 0.99)                 |               0.47 | no (0.70 / 0.40)            |                  0.91 |     0.36 |
| “Ties handled fairly”        | yes (0.98 / 0.96)                 |               0.71 | yes (0.57 / 0.15)           |                  0.83 |     0.74 |
| “Matches enough”             | yes (0.88 / 0.83)                 |               0.27 | no (0.96 / 0.91)            |                  0.70 |     0.24 |
| AST missing two-match gate   | no (0.85 / 0.78)                  |               0.17 | no (0.91 / 0.81)            |                  0.09 |     0.64 |
| XOR proposal, OR AST         | no (0.94 / 0.91)                  |               0.07 | no (0.96 / 0.93)            |                  0.05 |        — |
| AST missing “close” branch   | no (0.93 / 0.90)                  |               0.26 | no (0.82 / 0.65)            |                  0.04 |        — |

The structural Choice correctly separated the six structurally matching cases
from the three clearly wrong/incomplete ASTs in this hand-selected set. For
strict AST support, a 0.7 Noul alone would have accepted the vague-tie case
(0.71), as would the raw binary Choice label; other repetitions returned Noul
values around 0.68-0.75. The tie-clause Noul was 0.74 in the final run, versus
0.95-0.97 for the fully specified ranking controls. The per-clause guard
therefore kept that AST pending player approval. Applying a 0.7 probability
**and** 0.7 confidence cutoff to the strict binary Choice would abstain on the
correct Portuguese ranking (confidence 0.44). In this small sample, the Noul
plus separate clause judgments yielded more usable decisions. Neither
primitive alone proved full fidelity. The comparison is exploratory and does
not establish population accuracy or calibrated thresholds.

When strict fidelity fails, the compile LLM lists candidate gaps and legal
interpretations. Jev uses one Choice per gap, with an `ask_player` option,
plus Nouls for option legality and whether the alternatives can change a
winner or tie outcome. A choice is applied to the conservative revision only
when its selected-option probability and Choice confidence are both at least
0.7, its legality Noul is at least 0.8, and materiality is at least 0.7. The
last LLM returns `proposedRevision` (only supported choices), a concrete
`suggestedVersionForApproval` based on the AST, explicit assumptions, the
points the player can improve, and open questions. The suggested version is
for explicit player acceptance or rejection; it is never an official rule.
A final Jev batch checks both texts against game policy, whether every
suggested assumption is disclosed, question relevance, and whether the safe
revision added an unselected condition. A rejected review must not be shown
as an acceptable player draft.

| Full-chain observation                  | Behavior                                                                                                                                                                                                                                 | Wall time | Known provider cost |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------------: |
| “Closest together”, final candidate run | Jev chose `ask_player` for the tie and did not reach the 0.7/0.7 cutoff for the distance metric. The conservative text stayed unchanged; the concrete AST-based suggestion listed both assumptions for approval. Final review passed.    |  83.163 s |        $0.000640718 |
| “Ties handled fairly”, later run        | Jev left both material choices unresolved. The final LLM suggested an unrelated eligibility question and a rollover option; final review rejected the draft.                                                                             |   9.656 s |        $0.000698668 |
| “Matches enough”, later run             | Jev asked for the match threshold. The final LLM repeated the threshold question and raised unnecessary implementation questions; final review rejected the draft.                                                                       |  15.502 s |        $0.000698170 |
| Explicit rule, AST missing gate         | Jev chose “add the missing eligibility predicate” with probability 0.86 and confidence 0.82. The LLM nevertheless asked the player to clarify already explicit clauses; this should be treated as an AST repair, not a player ambiguity. |  23.065 s |        $0.001047164 |

One issue-list generation initially returned truncated JSON at a 1,200-token
limit; the runner now reports the finish reason and uses a larger explicit
limit. The LLM also proposed an invalid extra random tie-break, claimed that
“at least two” might mean exactly two, and asked about `max−min` versus
`max−min+1`. The last comparison cannot change a minimum ranking because it
adds the same constant to every ticket score. A focused Jev check gave Noul
0.93 that the winners stay identical and Choice `no` on a material difference
with probability 0.95. These findings justify independent legality,
materiality, and final-output checks; Jev itself also varied around the
cutoffs. The measured path is not ready to replace the existing compiler or
player approval gate. Candidate generation, deterministic final validation,
payment, and player response time are excluded from the costs and timings.

## Decision

Keep this path experimental. The 4/4 AST result is encouraging but too small
and too template-specific to replace the compiler. A proper rollout study needs
blind candidate generation on a larger held-out corpus, repeat runs, adversarial
and ambiguous proposals, behavior fixtures for every accepted AST, a calibrated
abstention threshold, and paired end-to-end measurements of accepted, rejected,
and clarification flows. Record generation, review, validation, user wait, and
all provider charges separately. Do not count a cheap Jev call as an end-to-end
speed or cost gain while the existing LLM stages still run.

## Direct natural-language winner evaluation

On 2026-09-21, `apps/api/scripts/jev-direct-rule-evaluation.mjs` tested whether
Jev could replace compilation and directly decide `WIN` or `LOSE`. The state
sent to Jev contained only the natural-language rule proposal, the target
ticket, the draw, the fixed game domain, and all competing tickets needed for a
ranking rule. No AST, expected answer, AST description, or derived feature was
sent. A local reference AST supplied the hidden executable oracle used to score
answers after the calls returned.

The balanced set contains 20 valid proposals and four scenarios per proposal:
10 simple, 5 medium, and 5 complex rules, split across Portuguese and English.
Each run therefore has 40 expected wins and 40 expected losses. It covers
thresholds, exact counts, arithmetic parity, ordered positions, distinct
digits, conjunction, exclusive-or, ranking, eligibility, ties, nested
quantifiers, mirrored order, and exactly-one-of-three logic. Three live runs
produced 240 scored scenarios for each primitive. Every request asked four
Choice and four Noul questions against one rule. Choice used `win`, `lose`, and
`cannot_determine`; Noul asked whether the target won.

The live alias resolved to `typesafe/jev-1.13-20260917`.

```powershell
node --import tsx apps/api/scripts/jev-direct-rule-evaluation.mjs --runs=3 --concurrency=4 --output=docs/jev-direct-rule-evaluation-results.json
```

| Tier    | Scored scenarios | Choice top accuracy | Choice 70/70 coverage | Choice accuracy when 70/70 | Noul accuracy | Combined 70/70 coverage | Combined accuracy |
| ------- | ---------------: | ------------------: | --------------------: | -------------------------: | ------------: | ----------------------: | ----------------: |
| Simple  |              120 |              87.50% |                85.00% |                     97.06% |        70.00% |                  62.50% |            96.00% |
| Medium  |               60 |              80.00% |                61.67% |                     91.89% |        68.33% |                  50.00% |            90.00% |
| Complex |               60 |              76.67% |                30.00% |                    100.00% |        56.67% |                  15.00% |           100.00% |
| **All** |          **240** |          **82.92%** |            **65.42%** |                 **96.18%** |    **66.25%** |              **47.50%** |        **94.74%** |

The 70/70 Choice gate requires both selected probability and reported
confidence to be at least 0.70. The Noul gate treats values at or below 0.30 as
a confident loss and values at or above 0.70 as a confident win. The combined
gate also requires Choice and Noul to agree. These are exploratory thresholds,
not calibrated production cutoffs.

Choice made 41 wrong top decisions: 32 false wins and 9 false losses. Most
Choice labels were stable across repeats (79/80 scenario pairs), but stability
did not imply correctness. Fourteen distinct scenarios had at least two wrong
runs. Two mistakes were especially unsafe because they passed the 70/70 gate in
all three runs:

- `S08/scenario-2`: `[1,3,5,20,22,24]` contains only three odd numbers, below
  the required four. Jev returned `win` with probabilities 0.90-0.92 and
  confidence 0.84-0.87.
- `M01/scenario-3`: `[10,70,80,90,99,100]` has only one match with
  `[10,20,30,40,50,60]`, below the required two. Jev returned `win` with
  probabilities 0.94-0.95 and confidence 0.91-0.93.

Requiring Choice and Noul agreement did not remove these errors: the combined
gate released 114/240 decisions and 6 were wrong, all false wins. Noul alone was
less accurate and less stable. Consequently, neither a confidence threshold nor
self-agreement makes direct winner evaluation safe.

The 60 requests took 6.152 seconds wall-clock with concurrency four. Summed
provider latency was 23.189 seconds, mean request latency was 386 ms, and the
reported cost was $0.00355635, or about $0.00001482 per scenario while asking
both primitives. By comparison, the local frozen-AST oracle evaluated 800,000
scenarios in 802 ms in a repeated timing probe, about 0.0010 ms per evaluation,
with deterministic answers and no provider charge. The timings are different
execution environments and are descriptive rather than a controlled hardware
benchmark.

The direct path cannot replace the AST pipeline. It violates the product rule
that an AI model never decides `WIN` or `LOSE`, cannot reproduce or audit every
winner deterministically, introduces a network dependency after the draw, and
produced confident false winners on elementary conditions. Jev can remain an
advisory semantic reviewer before activation; settlement must execute the exact
validated and frozen AST. Raw inputs, answers, probabilities, confidence,
usage, latency, and costs are stored in
`docs/jev-direct-rule-evaluation-results.json`.

## Jev review of proposal-to-AST semantic fidelity

On 2026-09-21, `apps/api/scripts/jev-ast-semantic-validation.mjs` tested the
narrower and more suitable Jev role: decide whether a completed AST implements
the natural-language proposal. The same 20 simple, medium, and complex rules
were used. Each reference AST was paired with one schema-valid,
single-dimension semantic mutation, producing a balanced set of correct and
incorrect ASTs. Mutations changed thresholds, strictness, polarity, source,
position, conjunction, XOR, ranking direction, eligibility, modulo semantics,
and mirrored order. Both the correct and mutated ASTs passed `ruleAstSchema`;
the task therefore measured meaning rather than syntax.

Two evidence modes were tested:

- `raw`: proposal, raw AST, and a compact definition of the DSL nodes;
- `described`: the same evidence plus `describeRuleAstForPlayers(ast)`, the
  deterministic total behavior description already produced by the compiler.

The initial paired presentation put one correct and one mutated AST in the same
state. Because that contrast could make the classification easier, the final
production-like test sent exactly one AST per request. Candidate order in the
paired test alternated by rule and run, and no expected label or mutation note
was sent in either layout. Both layouts were repeated three times with Choice
and Noul.

```powershell
node --import tsx apps/api/scripts/jev-ast-semantic-validation.mjs --runs=3 --concurrency=4 --output=docs/jev-ast-semantic-validation-results.json
node --import tsx apps/api/scripts/jev-ast-semantic-validation.mjs --layout=single --runs=3 --concurrency=4 --output=docs/jev-ast-semantic-validation-single-results.json
```

### Single-AST results

| Evidence                           | Judgments | Choice top accuracy | False accepts | False rejects | Choice 70/70 coverage | Choice 70/70 accuracy | Noul accuracy |
| ---------------------------------- | --------: | ------------------: | ------------: | ------------: | --------------------: | --------------------: | ------------: |
| Raw AST + DSL contract             |       120 |              91.67% |             3 |             7 |                84.17% |                95.05% |        93.33% |
| AST + contract + total description |       120 |              97.50% |             0 |             3 |                84.17% |               100.00% |        99.17% |

With the total description and the 70/70 Choice gate, Jev made 101 automatic
decisions and all were correct in this sample. It approved 45/60 correct-AST
runs, rejected 56/60 mutated-AST runs, and abstained on the remaining 19. It
never approved a mutated AST. Requiring Noul agreement produced the same
coverage and accuracy in this run.

All three top-label errors in described mode rejected the same correct complex
rule (`C02`), whose nested quantifiers express that a missed number and a
matched number share a units digit. The Choice confidence values were
0.36-0.53, so the 70/70 gate abstained instead of blocking automatically. This
is a useful fail-closed error, but it would send a valid rule to another
reviewer.

Raw AST review was less reliable. It falsely accepted the mutation that removed
the mirrored order from `C03` in all three runs. The selected `yes`
probabilities were only 0.51-0.60 and confidence was 0.26-0.40, so the 70/70
gate abstained. Raw mode also confidently rejected some correct nested ASTs;
five such false rejections passed the confidence gate.

### Paired diagnostic results

| Evidence                           | Choice top accuracy | Choice 70/70 coverage | Choice 70/70 accuracy | False accepts |
| ---------------------------------- | ------------------: | --------------------: | --------------------: | ------------: |
| Raw AST + DSL contract             |              94.17% |                90.00% |               100.00% |             0 |
| AST + contract + total description |             100.00% |                94.17% |               100.00% |             0 |

The paired result is diagnostic only; production validation normally has no
known-good alternative beside the candidate.

The paired run used 120 requests, cost $0.006961626, took 12.636 seconds at
concurrency four, and averaged 387 ms provider latency. The single-AST run used
240 requests, cost $0.009596286, took 22.504 seconds, and averaged 357 ms.

These results support Jev as a semantic review gate when it receives both the
AST and its deterministic total description. They do not establish that Jev
can certify an AST alone or replace deterministic validation. The corpus has
only 20 AST shapes and one mutation per rule; it does not cover serializer bugs,
multiple simultaneous mutations, adversarial source text, every nested scope,
or structurally different but behaviorally equivalent ASTs. Production use
should therefore treat a high-confidence `no` as review evidence and a
high-confidence `yes` as one required signal. Schema validation, source-span
coverage, executable behavior tests, independent review, exact artifact
hashing, and player approval remain mandatory. Full raw responses are stored in
`docs/jev-ast-semantic-validation-results.json` and
`docs/jev-ast-semantic-validation-single-results.json`.

## Piece-by-piece AST assembly

On 2026-09-21 a further question was tested: instead of judging finished
candidates from a template family, can Jev be handed every construct the
grammar allows and assemble an AST **one node at a time** from the proposal?
The runner is `apps/api/scripts/jev-ast-assembly.mjs`.

The assembler holds a schemaVersion 3 tree with exactly one hole marked
`<<FILL_THIS_HOLE>>`. Per step it sends Jev the proposal, the fixed game
domain, the partially built tree, the path and expected type of the current
hole, the open binder scopes, and the decisions already taken. It asks one
Choice over the constructs legal at that hole, plus one Choice per enum or
integer field those constructs need. The chosen node is written into the tree,
its own holes are pushed in pre-order, and the loop repeats until the tree is
closed or a budget stops it. Legality — binder scope for `elem`/`pair`, the
binder-depth cap, the static-length requirement of `at` and `slice`, and the
node budget — comes from `packages/rule-schema`, never from the proposal.

Two flows share that identical loop and differ only in where the menu comes
from:

- **generic**: every construct the schema allows at the hole. The integer menu
  is the decimal base, the counts a six-number ticket can produce, and every
  number the proposal itself states in digits or in English/Portuguese words.
  Nothing is tailored to a proposal, so this flow runs unchanged on any rule.
- **planned**: one `openai/gpt-oss-120b` call first writes an assembly plan for
  that proposal — narrowed construct menus per hole type, the integer list, the
  expected result shape, and two or three sentences of intended structure. The
  plan narrows the menu; Jev still chooses at every hole; the schema still
  decides legality. Terminating constructs (`source`, `lit`, `compare`) are
  re-added when a plan omits them, otherwise a tree could never close.

### Reproduction

```powershell
node --import tsx apps/api/scripts/jev-ast-assembly.mjs --self-test
node --import tsx apps/api/scripts/jev-ast-assembly.mjs --flow=both --concurrency=4 --output=docs/jev-ast-assembly-results.json
```

The self-test makes no network call. The measured run makes paid OpenRouter
requests. Nothing is submitted; every candidate stops before the production
validator, player approval, payment, and artifact freeze.

The corpus is the 20-rule benchmark already used for direct winner evaluation
(10 simple, 5 medium, 5 complex; Portuguese and English). Jev sees only the
proposal and the grammar. The reference ASTs stay hidden and are used solely to
score a finished candidate, against the four curated scenarios per rule **and**
against 200 seeded random scenarios shared by every rule. A candidate counts as
correct only when it matches the reference on all 204.

### The assembler can reach every reference

`--self-test` replaces Jev with an oracle that reads the reference AST. All 19
schemaVersion 3 references were rebuilt exactly, in 5 to 54 steps. M03's
reference is schemaVersion 2 and is out of scope for a v3 assembler; its
candidates are still scored by behavior. The first attempt capped the tree at
26 nodes and 24 steps, which M05 and C05 exceeded because an expanded
exclusive-or repeats whole subtrees; the caps are now 64 nodes, 60 steps, and
depth 10, all inside the schema's own limits. A wrong choice in the measured
runs is therefore Jev's, not a menu that lacked the right construct.

### Live results

Two full runs, same command, same tree:

| Flow    | Run | Completed | Schema-valid | Correct on all 204 | Identical to reference | Mean random agreement |
| ------- | --- | --------: | -----------: | -----------------: | ---------------------: | --------------------: |
| generic | 1   |     20/20 |        20/20 |               9/20 |                   8/20 |                 75.3% |
| generic | 2   |     20/20 |        20/20 |               8/20 |                      — |                     — |
| planned | 1   |     20/20 |        20/20 |              13/20 |                  12/20 |                 87.9% |
| planned | 2   |     19/20 |        19/19 |              12/20 |                      — |                     — |

Eight rules were correct in both generic runs; twelve in both planned runs. The
only unstable rules were M01 (generic) and C04 (planned). Run 1 of the planned
flow needed two plan calls re-run after provider failures (an empty JSON body
on M02, a 120 s timeout on C02); run 2 lost C02 to a step timeout. Those are
provider failures, not assembly failures, but they are part of the cost of a
flow that adds an LLM call.

By tier, run 1:

| Tier    | Rules | generic correct | planned correct |
| ------- | ----: | --------------: | --------------: |
| simple  |    10 |               8 |               8 |
| medium  |     5 |               1 |               2 |
| complex |     5 |               0 |               3 |

The two flows agree on the easy half and separate on everything else. The
generic flow solved no complex rule in either run.

### Schema validity proves nothing here

Every candidate in run 1 — all 40 — parsed against `ruleAstSchema`, including
the two trees below. Static validation confirms shape, scope, and runtime
bounds; it cannot see that a rule ignores its inputs. Any release decision on
this path must rest on behavior, not on a successful parse.

### What went wrong, concretely

- **A dropped operator layer.** S07 ("a soma dos seis números do seu jogo for
  par") became `sum(guess) == 0` in the generic flow: the comparison, the
  reduction and the source are right, the parity is simply absent. The planned
  flow had a plan that named the modulo explicitly, and Jev still chose `add`
  at the operator hole and `0` at the operand hole, producing
  `(sum(guess) + 0) == 0`. Both runs landed at 51% agreement — near a coin flip
  on a rule a person reads in one breath.
- **A tree that never reads the ticket.** S08 planned closed in five steps as
  `(2 mod 2) >= 4`: constant false, schema-valid, no reference to `guess` or
  `draw` anywhere. The cause is the plan, not the choice — see the next section.
- **The wrong top-level shape.** On C05 and M02, a per-ticket rule was called
  comparative. C05 then closed in two steps with a constant score, so every
  ticket ties and everyone wins. This failure is invisible in the tree's shape
  and total in its effect. The plan also said `ranking` for both, so responsibility
  is shared; in the generic flow, with no plan at all, Jev made this error only on
  M02 (confidence 0.15).
- **A rebound binder.** C03 generic opened correctly with
  `pairs_exists(guess, reverse(draw))` and then put a second
  `pairs_exists(guess, draw)` in the `where` slot. The inner binder shadows the
  outer pair, so the mirror the proposal asked for silently disappears.
- **Exclusive-or flattened to or.** M05 planned produced a plain `or` of the two
  conditions. It matched the reference on 200/200 random scenarios and failed
  only the curated scenario where both conditions hold, because random tickets
  almost never satisfy both. Random-scenario equivalence alone would have passed
  this rule; the hand-built edge fixtures are what caught it.

### What the plan actually sends, and what it costs

The plan LLM never writes a tree. It receives the fixed game domain, the full
construct vocabulary with its one-line descriptions, and the proposal, under
`PLAN_INSTRUCTION`, and returns a strict JSON object with narrowed menus. For
S08, "The player wins if at least four of the six guessed numbers are odd":

```json
{
  "structureSummary": "The rule maps each of the six ticket numbers to 1 if the number is odd and 0 otherwise (using remainder and a compare predicate inside an ite). The resulting list is reduced by summing its elements, yielding the count of odd numbers. Finally the sum is compared to the constant 4, and the ticket wins when the count is at least four.",
  "expectedResultType": "ranking",
  "allowedArrayKinds": ["map"],
  "allowedScalarKinds": ["lit", "arith", "ite", "elem"],
  "allowedPredicateKinds": ["compare"],
  "allowedIntegers": [0, 1, 2, 4]
}
```

Only `structureSummary` and `expectedResultType` reach Jev, as
`assembly_plan_guidance` in every step's state. The three menu lists never reach
Jev at all — they delete options from the Choice before it is asked. That is the
whole mechanism, and it is where the flow's gain and its worst failure both come
from. The prose above says the list is "reduced by summing its elements", but
`allowedScalarKinds` omits `reduce`, so at the first scalar hole Jev was offered
only `lit`, `arith` and `ite`:

```json
{
  "kind": {
    "type": "choice",
    "instructions": "The rule tree has exactly one hole marked <<FILL_THIS_HOLE>> at path `result.predicate.left`, which must hold a single number. Using rule_proposal, decide which construct belongs there. Judge only this hole; the remaining holes are filled in later steps.",
    "criteria": {
      "lit": "A fixed number stated by the rule.",
      "arith": "Combine two numbers with add, subtract, multiply, divide, or remainder.",
      "ite": "Pick one of two numbers depending on a condition."
    }
  },
  "lit_value": { "criteria": { "0": "…", "1": "…", "2": "…", "4": "…" } },
  "arith_op": {
    "criteria": { "add": "…", "sub": "…", "mul": "…", "div": "…", "mod": "…" }
  }
}
```

At the same hole the generic flow offered `lit, reduce, at, arith, abs, ite`
with integers `0,1,2,3,4,5,6,10`, and Jev picked `reduce(count)` — the right
construct. `(2 mod 2) >= 4` is therefore not a judgment Jev made badly; it is
the best available answer once `reduce` was deleted.

Replaying every plan with the oracle decider measures how often that happened.
The reference AST stayed reachable under its own plan in **17 of 19** rules; the
plan removed a construct the reference needs in two:

| Rule | Hole                                | Needed   | Menu the plan left |
| ---- | ----------------------------------- | -------- | ------------------ |
| S08  | `result.predicate.left`             | `reduce` | lit, arith, ite    |
| C02  | `result.predicate.where.where.left` | `arith`  | lit, elem          |

Two guards already fire on their own: a terminating construct (`source`, `lit`,
`compare`) was missing from a menu in 12 of 20 plans and had to be re-added, and
7 plans listed no integers at all. Both are recorded per rule in `planNotes`.

The plan's `expectedResultType` was `ranking` for 10 of the 20 rules, but only
three rules are comparative — 7 false claims. Jev overrode the wrong hint on
S06, S08, S10, M03 and C03, and followed it on M02 and C05. The plan's shape
hint is the least reliable field it produces, and it is the one field whose
error is unrecoverable.

### Jev flagged the shape errors, and a gate exploits that

Taking the lowest applicable selected probability across all of a rule's steps
as a per-rule gate:

| Gate                                               | generic run 1   | generic run 2       | planned run 1       | planned run 2       |
| -------------------------------------------------- | --------------- | ------------------- | ------------------- | ------------------- |
| min probability >= 0.70                            | 0 released      | 2 released, 1 wrong | 9 released, 0 wrong | 9 released, 0 wrong |
| min probability >= 0.70 and min confidence >= 0.70 | 0 released      | —                   | 6 released, 0 wrong | —                   |
| no gate                                            | 9 of 20 correct | 8 of 20             | 13 of 20 correct    | 12 of 20            |

The three catastrophic result-shape choices came with Choice confidence 0.08
(C05 planned), 0.15 (M02 generic) and 0.30 (M02 planned) — the model did not
hide them. On the planned flow a single 0.70 probability floor released 9 of
the 13 correct candidates and none of the 7 wrong ones, in both runs. The
generic flow has no usable operating point: it never clears 0.70 on every step
in run 1, and the one time it released anything in run 2, one of the two
candidates was wrong.

Two caveats. TypeSafe defines Choice confidence as distribution concentration,
so the planned flow's higher confidence partly reflects its shorter menus
rather than better judgment; the two flows' confidence values are not directly
comparable. And 20 rules with two repeats cannot calibrate a threshold — this
shows the signal exists, not where to set the cut.

### Cost and time

Run 1, concurrency four, 214.8 s of wall clock for both flows together:

| Flow    | Jev calls |  Jev cost |  LLM cost | Summed Jev latency | Summed LLM latency |
| ------- | --------: | --------: | --------: | -----------------: | -----------------: |
| generic |       181 | $0.011063 |         — |             60.3 s |                  — |
| planned |       158 | $0.007128 | $0.004607 |             52.2 s |            443.0 s |

Run 2 was $0.012969 (generic) and $0.007521 plus $0.004668 (planned). The plan
call both narrows the search — fewer holes, so fewer Jev calls — and dominates
the clock: one plan call per rule costs more wall time than every Jev step of
that rule combined. These are provider charges for the experiment, not the cost
of a production pipeline, which still has to run review, clarification,
deterministic validation, and player approval on top.

### Reading of the result

Piece-by-piece assembly works where the rule is one shallow mechanism, and the
schema keeps every candidate parseable, but neither flow is a compiler. The
generic flow — the one that would run unchanged on any proposal — was correct on
8 or 9 of 20 and on none of the complex rules, and no threshold makes its output
safe to release. The LLM-written plan is what moves the number: it raised
correctness to 12 or 13 of 20 and, with a probability floor, released 9 rules
with no error in either run. But the work that produced that gain is the LLM
reading the proposal and describing the intended structure — the same work the
existing compiler already does, now split across an extra provider call. Jev's
contribution in that flow is choosing inside a space the LLM has already
shaped, and its useful signal is the low confidence it reports when the shape
is wrong.

That same plan is also the flow's single point of failure, and it fails
silently. A menu that omits one needed construct puts the correct AST out of
reach (2 of 19 rules here) and the assembler still returns a schema-valid tree
rather than stopping, so a plan error is indistinguishable from a decision
error in the output. Any version of this path needs the reachability check run
against the plan, not only against the grammar, and needs an explicit abstention
when a hole has no honest option left.

The concrete, reusable findings are narrower than the flows: schema validity is
not evidence of fidelity on this path; random-scenario equivalence misses
exclusive-or errors that curated edge cases catch; a rebound inner binder can
delete a clause without leaving a trace in the tree's shape; a narrowed menu can
make the right answer unreachable without any component reporting an error; and
a low first-step confidence is a real warning that the rule's overall shape was
misread. None of this changes PRD §7.1: the model compiles intent, the
deterministic runtime executes the frozen artifact, and the Final Validator,
player approval, and artifact freeze stay exactly where they are. Full inputs,
transcripts, per-step probabilities, usage, and costs are in
`docs/jev-ast-assembly-results.json` and `docs/jev-ast-assembly-run2.json`.

## Per-piece inclusion screen, and who assembles from it

The third question was whether Jev does better when it is asked about the
pieces themselves rather than about holes: show it every construct of the
grammar, ask one Noul per construct — "does this rule need it?" — and build only
from what survives. `apps/api/scripts/jev-ast-piece-selection.mjs` runs that
screen and then three flows over the same 20-rule benchmark and the same
scoring (4 curated scenarios plus 200 seeded random ones, reference AST hidden):

- **jev-screen**: Jev screens the pieces, then Jev assembles hole by hole from
  the survivors — the same assembler as before, narrowed by the screen instead
  of by an LLM plan.
- **llm-build**: Jev screens the pieces, then the LLM writes the whole tree
  using only those constructs.
- **llm-free**: the control. The LLM writes the tree from the full grammar, with
  no Jev call anywhere.

The screen is three Jev calls per rule, one per hole type, each carrying the
exact JSON shape of every construct at that position (generated from the
assembler's own catalog, so the description cannot drift) plus a one-line
summary of the other positions. Constructs at Noul >= 0.5 are kept. A terminating
construct (`source`, `lit`, `compare`) is re-added when the screen rejects it,
otherwise no tree could close. The LLM flows use JSON mode plus zod validation
and one repair attempt: constrained decoding against the recursive AST schema
overran the token limit in a live probe, so it was not used.

```powershell
node --import tsx apps/api/scripts/jev-ast-piece-selection.mjs --flow=all --concurrency=4 --output=docs/jev-ast-piece-selection-results.json
```

### Results

Two full runs returned the **same rules** correct in every flow, not merely the
same totals:

| Flow       | Correct on all 204 | simple | medium | complex | Jev calls | Jev cost  | LLM calls | LLM cost  |
| ---------- | -----------------: | -----: | -----: | ------: | --------: | --------: | --------: | --------: |
| jev-screen |              7/20  |   7/10 |   0/5  |    0/5  |       237 | $0.01278  |         0 | —         |
| llm-build  |             18/20  |  10/10 |   4/5  |    4/5  |        60 | $0.00476  |     22–23 | $0.00632–0.00661 |
| llm-free   |             **20/20** | 10/10 | 5/5  |    5/5  |         0 | —         |     20–21 | $0.01029–0.01053 |

### The screen is good; assembling from it is not

The Nouls rank the right pieces. On S01 ("pelo menos três dos seus seis números
forem sorteados") the screen returned `source` 0.96, `intersection` 0.65 for
arrays, `lit` 0.86, `reduce` 0.61 for scalars, and `compare` 0.71 for
predicates — exactly the four constructs the reference uses, at the top of their
lists. Measured against what each reference actually needs, the screen dropped a
required construct in only **4 of 19** rules (S08 `filter`, M05 `and`, C02
`intersection`, C03 `reverse`).

Yet jev-screen scored 7/20, below the unnarrowed generic flow's 8–9/20, and
solved nothing above the simple tier. S01 shows why. The screen also kept
`contains` at 0.60, and at the first predicate hole Jev chose `contains` over
`compare`, closing the tree as "the draw contains the number 3" in four steps.
The generic flow, offered all 18 predicate constructs at that same hole, picked
`compare` and got the rule right. Cutting the menu from 18 plausible options to
2 raised the share of the probability mass sitting on a decoy. Fewer options did
not make the decision easier; it made the wrong option cheaper to reach.

### The LLM recovers from a bad screen; the assembler cannot

llm-build honored the restriction in every rule — zero off-menu constructs in
both runs — and still reached 18/20, including three of the four rules whose
screen had dropped a needed piece. Denied `filter` on S08 it counted odds
another way; denied `intersection` on C02 and `and` on M05 it found equivalent
formulations. Only C03 failed, where the mirror comparison genuinely requires
`reverse` and no substitute exists. The remaining miss was M03, where both
attempts were rejected by zod with the bare message `Invalid input` — the union
error carries no usable detail, so the repair turn had nothing to act on. That
is a concrete defect in the repair loop, not a model failure.

The contrast with jev-screen is the finding. Given the same restricted piece
set, a writer that can choose *where* pieces go recovers from a missing piece;
a walker that must answer a fixed sequence of local questions cannot. Local
choice has no way to express "this construct is wrong for this hole because of
what the tree needs three levels down".

### The control solves the benchmark without Jev

llm-free was correct on all 20 rules in both runs, needing one repair attempt
each time. It is not reproducing memorized reference trees: 6 of the 20
candidates are structurally different formulations that behave identically
across all 204 scenarios. On C05 it wrote exactly-one-of-three as an `or` of
three `and`s with two `not`s each, where the reference uses
`and(or(...), not(and), not(and), not(and))`. The 200 random scenarios
discriminate on every rule (reference win rates 0.5% to 55.5%), so this is not a
degenerate test.

Adding the Jev screen ahead of that call costs three extra Jev calls per rule
and loses two rules. It does buy a shorter prompt — llm-build's LLM charges were
about 40% lower than llm-free's, because listing fewer constructs shortens the
request — so the screen is a token-cost optimization that is not free in
accuracy.

### What this means for the earlier flows

The piece-by-piece results above should be read against this control. The
generic assembler reached 8–9 of 20 and the LLM-planned assembler 12–13, while
one LLM call with the full grammar and a validation retry reached 20. On this
benchmark, decomposing compilation into per-hole decisions does not add accuracy
at any point; it removes it, and every narrowing mechanism tried — an LLM plan,
a Jev piece screen — mainly changes how the accuracy is lost.

Two limits on that reading. Twenty rules, however carefully tiered, is a small
and non-adversarial corpus; the interesting production failures are vague and
contradictory proposals, which this corpus does not contain. And llm-free is
only the *generation* stage of the existing compiler, not the compiler: it
carries no interpretation, no review, no clarification, no coverage check and no
player approval. A 20/20 generation rate alongside the acceptance instability
recorded elsewhere in this project says the bottleneck is not the model's
ability to write a correct tree.

Raw screens, per-piece Nouls, transcripts, attempts, usage and costs are in
`docs/jev-ast-piece-selection-results.json` and
`docs/jev-ast-piece-selection-run2.json`.

## What was implemented from these experiments

The single-AST described-mode result is the only measurement this project builds
on: one AST per request, with the deterministic total description in state,
gated at Choice probability and confidence ≥0.70. It is the shape a production
review has, and it made no false accept.

That configuration ships as the **typed semantic reviewer** (PRD §7.3.2), which
may replace the routine `review_rule_ast` LLM call and nothing else. It is off by
default; `docs/jev-guarded-rollout.md` holds the configuration surface, the
calibration evidence an operator must approve, the release gates, and the four
rollout phases.

The prohibitions above are enforced in code rather than restated as policy. The
direct `WIN`/`LOSE` evaluation is not reachable from any production path: the
review request carries no guess, no draw and no ticket, and every deterministic
gate still decides after a `PASS`. The numbers in the JSON result files are
recomputed from the individual judgments by `apps/api/src/jevEvidence.test.ts`,
so a summary edit or a redefined metric fails the suite instead of quietly
moving the ground under the release gates.

Piece-by-piece assembly and bounded-grammar narrowing were **not** implemented.
The LLM still generates the complete AST.
