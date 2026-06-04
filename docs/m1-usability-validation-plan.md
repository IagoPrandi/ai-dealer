# M1 Usability Validation Plan

## Purpose

This protocol produces the human-testing evidence required by the `M1 Approval` criteria in `PRD.md`.

Automated E2E tests verify functionality but must not be counted as human testers.

## Prototype

- Start route: `http://localhost:3004/play`
- Primary surface: mobile viewport or a mobile device
- Testers should receive no explanation of the core loop before starting.

## Session Procedure

For each tester:

1. Open `/play`.
2. Allow up to 10 seconds to inspect the live round.
3. Ask the tester to explain what they think the game loop is.
4. Ask the tester to submit a simulated guess.
5. Ask the tester to vote for a rule.
6. Ask the tester to propose a rule.
7. Show the simulated result and share-card flows.
8. Ask: "Would you join another round?"

Do not guide the tester unless they are blocked. Record any guidance because assisted completion does not count as unassisted completion.

## Required Session Record

Record one row per tester with these fields:

| Field | Type | Pass condition |
|---|---|---|
| `tester_id` | Anonymous identifier | Present and unique |
| `understood_core_loop` | Boolean | Tester explains picking numbers, voting for a rule, and watching the draw/result |
| `completed_simulated_guess` | Boolean | Tester reaches the guess success state without assistance |
| `cast_vote` | Boolean | Tester casts at least one vote without assistance |
| `proposed_rule` | Boolean | Tester completes at least one simulated rule proposal without assistance |
| `would_join_another_round` | Boolean | Tester answers yes |
| `notes` | Text | Blockers, confusion, or assistance provided |

Do not store names, wallet addresses, or other personal data.

## Calculation

For each metric:

```text
percentage = passing testers / total completed sessions * 100
```

M1 is approved only when the recorded results meet every PRD threshold:

| Metric | Required |
|---|---:|
| Understand core loop after first session | 80%+ |
| Complete simulated guess submission | 70%+ |
| Cast at least one vote | 50%+ |
| Propose at least one rule | 25%+ |
| Would join another round | 40%+ |

## Approval Rules

- Use only completed human sessions in the denominator.
- Keep raw anonymous session records available for audit.
- Do not infer or fabricate missing responses.
- If any threshold fails, keep M1 approval pending and address the observed usability blockers before retesting.
- Tick the M1 Approval criteria in `PRD.md` only after the results are recorded and reviewed.
