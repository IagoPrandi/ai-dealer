# Mobile Low-Fidelity Wireframes

These wireframes define information hierarchy and mobile navigation for M0.5. They are intentionally low-fidelity and avoid visual styling decisions reserved for M1 implementation.

## Shared Mobile Shell

Target viewport assumptions:

- Minimum supported width: 320px.
- Primary design check widths: 360px, 390px, 414px, and 768px.
- Sticky header contains prize, countdown, and wallet status.
- Sticky bottom action area contains the single most important next action.
- Secondary actions live in compact tabs or icon buttons.

```text
+--------------------------------+
| Prize: 12.4 SOL      00:42:18  |
| Wallet: Connected      Turn #8 |
+--------------------------------+
|                                |
| Screen-specific content        |
|                                |
|                                |
+--------------------------------+
| Home | Pick | Rules | Results  |
+--------------------------------+
| Primary action                 |
+--------------------------------+
```

## `/play` Live Round Hub

```text
+--------------------------------+
| Prize: 12.4 SOL      00:42:18  |
| Wallet: 4sF...9k2      Turn #8 |
+--------------------------------+
| Next action                    |
| Pick six numbers to enter      |
|                                |
| [Pick numbers]                 |
+--------------------------------+
| Rule of the Hour               |
| "Closest even sum wins"        |
| Leading until election closes  |
| [View rules] [Vote]            |
+--------------------------------+
| Your turn status               |
| Guess: not submitted           |
| Game Token: not issued         |
| Vote: available after guess    |
+--------------------------------+
| Activity                       |
| Rule proposed                  |
| Vote cast                      |
| Prize increased                |
+--------------------------------+
| Home | Pick | Rules | Results  |
+--------------------------------+
```

## First-Time Welcome State

```text
+--------------------------------+
| Prize: 12.4 SOL      00:42:18  |
| Wallet: Not connected          |
+--------------------------------+
| Play the live turn             |
| Pick six numbers, submit once, |
| vote on a rule, and watch the  |
| draw resolve.                  |
+--------------------------------+
| What you need                  |
| 1. A Solana wallet             |
| 2. One mobile approval         |
| 3. Six unique numbers          |
+--------------------------------+
| [Connect wallet]               |
+--------------------------------+
```

## Number Selection

```text
+--------------------------------+
| Pick 6 numbers                 |
| Selected: 04 12 27 51 __ __    |
+--------------------------------+
| 01 02 03 04 05 06 07 08 09 10  |
| 11 12 13 14 15 16 17 18 19 20  |
| ...                            |
| 91 92 93 94 95 96 97 98 99 100 |
+--------------------------------+
| [Randomize] [Clear]            |
+--------------------------------+
| Review guess                   |
+--------------------------------+
```

Rules:

- Number tiles must have stable dimensions and never resize after selection.
- Selected number tray must remain visible while scrolling.
- Review stays disabled until exactly six unique numbers are selected.

## Guess Review And Wallet Approval

```text
+--------------------------------+
| Review guess                   |
+--------------------------------+
| Numbers                        |
| 04 12 27 51 62 88              |
+--------------------------------+
| Cost                           |
| Entry fee: 0.01 SOL            |
| Network fee: shown by wallet   |
+--------------------------------+
| This creates your Game Token   |
| for voting and rule actions.   |
+--------------------------------+
| [Approve in wallet]            |
+--------------------------------+
```

Return states:

- Pending: keep numbers locked and show confirmation progress.
- Rejected: return to review with a clear message.
- Failed: return to review with retry.
- Confirmed: show Game Token issued and next actions.

## Rule Proposal

```text
+--------------------------------+
| Propose a rule                 |
+--------------------------------+
| Rule text                      |
| [                              |
|  Closest total to the drawn    |
|  numbers wins...               |
| ]                              |
| 63 / 80 tokens                 |
+--------------------------------+
| Preflight checks               |
| Token limit: pass              |
| Duplicate check: pass          |
| Safety gates: pass             |
+--------------------------------+
| [Submit proposal]              |
+--------------------------------+
```

Token states:

- 0 to 64 tokens: neutral counter.
- 65 to 80 tokens: warning counter with editing guidance.
- More than 80 tokens: submit disabled and rejection message.
- Preflight rejection: preserve text and show specific error code.

## Voting

```text
+--------------------------------+
| Vote for a rule                |
+--------------------------------+
| Leading                        |
| Closest even sum wins          |
| 42 votes                       |
| [Vote] [Audit]                 |
+--------------------------------+
| Eligible                       |
| Highest odd number wins        |
| 27 votes                       |
| [Vote] [Audit]                 |
+--------------------------------+
| Home | Pick | Rules | Results  |
+--------------------------------+
```

## Active Rule Of The Hour

```text
+--------------------------------+
| Rule of the Hour               |
+--------------------------------+
| Closest even sum wins          |
| Active for this turn           |
+--------------------------------+
| How it affects the draw        |
| The alternative prize bucket   |
| will use this rule after VRF.  |
+--------------------------------+
| [View audit] [Share rule]      |
+--------------------------------+
```

## Draw, Result, Near-Miss, And Reward Status

```text
+--------------------------------+
| Results                        |
+--------------------------------+
| Draw numbers                   |
| 04 12 27 51 62 88              |
+--------------------------------+
| Your guess                     |
| 04 12 27 51 63 90              |
| Near miss: 4 exact positions   |
+--------------------------------+
| Original result                |
| No payout                      |
+--------------------------------+
| Rule of the Hour result        |
| Creator reward: pending        |
+--------------------------------+
| [Share card] [View history]    |
+--------------------------------+
```

## Empty, Loading, Failed, And Delayed States

```text
+--------------------------------+
| Loading current turn           |
| [skeleton rows with stable size]|
+--------------------------------+
```

```text
+--------------------------------+
| No active turn                 |
| New turn opens shortly.        |
| [Refresh]                      |
+--------------------------------+
```

```text
+--------------------------------+
| Connection issue               |
| Latest confirmed state is not  |
| available yet.                 |
| [Retry] [View status]          |
+--------------------------------+
```

```text
+--------------------------------+
| Draw delayed                   |
| VRF confirmation is pending.   |
| Your guess remains recorded.   |
| [View audit]                   |
+--------------------------------+
```
