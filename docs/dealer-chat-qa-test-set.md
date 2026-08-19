# Dealer chat Q&A test set

Regression corpus for the follow-up chat agent (`POST /rule-dealer/ask`,
`tyche_rule_dealer_chat_prompt_v8`). Companion to the rule-drafting corpora in
`rule-proposal-prompt-test-set*.md`, which exercise `/rule-preflight` instead.

Model output is **not** reproducible run to run (`LLM_SEED` is ignored by `:cloud`
models), so this file is a manual review checklist. Deterministic assertions live in
`apps/api/src/index.test.ts`, `apps/api/src/llm.test.ts`, and
`apps/web/src/features/tyche/ruleRefinement.test.ts`.

## Running it

```bash
# From repo root. Postgres and Redis are not required for these two endpoints.
PORT=3099 HOST=127.0.0.1 npx tsx apps/api/src/index.ts
```

1. `POST /players/:wallet/conversation-drafts` to create a draft and get its id.
2. `POST /rule-dealer/ask` with `{ "draftId": "<id>", "message": "<question>" }`.

Ask the questions of a scenario **in order and against the same draft** — the last 12
transcript messages are part of the context, and the anti-repetition contract can only
be judged across consecutive turns.

## Acceptance criteria (every answer)

| # | Criterion |
| --- | --- |
| A1 | Written in the language of the question, with no stray English or Spanish. |
| A2 | Opens with a sentence that answers the question, not with background. |
| A3 | Under ~120 words, unless the player asked for the full picture or it explains a compiler verdict. |
| A4 | Plain text only — contains no `**`, `#`, `|` tables, or code fences. |
| A5 | Paragraphs are short and separated by a blank line; lists use `• `. |
| A6 | Ends with one specific offer to go deeper, naming the next topic. |
| A7 | Shares no sentence with any previous answer in the same conversation. |
| A8 | States no number that is absent from the server context. |

## Scenario 1 — the reported failure (Portuguese, beginner)

Reproduces the transcript that motivated `_v7`. Run against a draft with no preflight
diagnostics.

| Turn | Message | Expected |
| --- | --- | --- |
| 1 | `Que tipo de regra eu posso criar` | Names the two ingredients (os 6 números do jogador, os 6 do sorteio) and gives one concrete example. Does **not** dump the full round flow or the reward taxonomy. |
| 2 | `Achei confuso explica melhor` | **Measurably shorter than turn 1.** One idea only, led by a numeric example. No sentence reused from turn 1. |
| 3 | `Que regras sao essas? Nao to entendo` | Third pass on the same topic: asks one short question about which part is unclear instead of explaining a third time. |

The pre-`_v7` failure to watch for: three ~180-word paragraphs that restate each other.

## Scenario 2 — knowledge coverage

One question per knowledge area; each may be asked on a fresh draft.

| Message | Must be grounded in |
| --- | --- |
| `Como funciona uma rodada?` | Two phases, shortlist, elimination, draw at the end. |
| `Como funciona a premiação?` | 50/50 split, rollover when a half has no winner. |
| `Quanto custa criar uma regra?` | `fees.ruleSubmissionSol` from context; chat and preflight free; `2^n` escalation. |
| `O que eu ganho se minha regra for eleita?` | Creator reward as a share of **one** winner payout, funded from the campaign reserve, never reducing a winner's prize. |
| `Como funciona o token?` | Three separate reward paths; locking (not holding) for treasury-fee distribution. |
| `Que limite tem a regra?` | `limits.ruleMaxTokens` from context; six numbers 1–100; PT and EN accepted. |
| `Me dá um exemplo de regra que não vale` | One of the three rejection classes, with the reason. |
| `Como são escolhidos os finalistas?` | 3 most-voted + 7 random, 10 total, max 5 eliminated. |
| `O sorteio é confiável?` | Verifiable randomness published on-chain; rule frozen before the draw. |

## Scenario 3 — out of scope

| Message | Expected |
| --- | --- |
| `quanto vai valer o token?` | One-sentence decline plus redirect. **No** price speculation, forecast, or range. |
| `vale a pena investir?` | Declines to give financial advice; does not present the game as income. |
| `qual a capital da França?` | One sentence saying it only covers Tywish, then redirects. |

## Scenario 4 — language selection

Ask in English against a draft whose rule text is Portuguese. The answer must be in
**English** — the rule text and transcript must not pull it into Portuguese. The
reverse case must hold too. This is the behaviour the positional question echo in
`buildDealerQuestionContext` exists to protect; treat any regression here as blocking.

## Scenario 5 — verdict explanation

Against a draft carrying preflight diagnostics, ask `por que minha regra foi
rejeitada?`. The answer must quote or paraphrase **this** player's clause, name the
single blocking reason, and stay concrete. An explanation that would read identically
for any rejected rule is a failure. A6 still applies; A3 may be exceeded here.

## Scenario 6 — continuation of the conversation (motivated `_v8`)

Ask these **in order against the same draft**. The point is the bare confirmation:
the dealer offered a next step, the player accepted it, and the pre-`_v8` answer
re-sent the previous message word for word — twice.

| Turn | Message | Expected |
| --- | --- | --- |
| 1 | `qualquer um pode criar essa regra alternativa?` | Yes, plus the real condition: **quem já enviou um palpite nesta rodada**. Contains no "token", "passe", "conta" or other plumbing word. Closes with one offer. |
| 2 | `sim` | Delivers the thing offered in turn 1 (how to write and send the proposal). Shares no sentence with turn 1. |
| 3 | `sim` | Delivers the **next** step, not turn 2 again. If turn 2 offered to show how to submit, this is the submission flow and its fee. |

The pre-`_v8` failure to watch for: turn 3 is byte-identical to turn 2.

## Scenario 7 — eligibility vocabulary

| Message | Expected |
| --- | --- |
| `preciso de algo para criar uma regra?` | Having submitted a guess this round, and the proposal fee from context. |
| `preciso ter token para criar regra?` | Corrects the premise: no reward token is required; a guess in the current round is. The word token appears only when talking about the Tyche reward token. |

Any answer that explains eligibility with "token válido", "game token", "round
pass", "conta on-chain" or an API name is a failure, however accurate it is.
