# Mobile User Flow Diagram

This is the M0.5 mobile-first flow baseline for `/play`. The route is the primary public DApp entry point for mobile browsers, in-wallet browsers, and mobile wallet deep-link returns.

## Primary Route

- `/play` is the default mobile game route.
- Desktop may reuse the same route with wider layout affordances, but no critical action may require desktop navigation.
- Bottom navigation and sticky primary calls to action must keep the current turn, number entry, rule voting, rule proposal, and result history reachable with one-handed use.

## Core Game Loop

```mermaid
flowchart TD
  A[Open /play] --> B{Wallet connected?}
  B -->|No| C[First-time welcome state]
  C --> D[Connect wallet]
  B -->|Yes| E[Live round hub]
  D --> F{Connection approved?}
  F -->|No| C
  F -->|Yes| E
  E --> G[Select six numbers]
  G --> H[Review guess]
  H --> I[Approve submit_guess transaction in wallet]
  I --> J{Returned to DApp?}
  J -->|Pending| K[Transaction pending state]
  K --> L{Confirmed?}
  J -->|Confirmed| M[Game Token issued]
  L -->|Yes| M
  L -->|Failed| N[Recoverable transaction failure]
  N --> H
  M --> O[Vote on rules]
  M --> P[Propose free-form rule]
  O --> Q[Approve vote transaction]
  Q --> E
  P --> R[Rule token count and preflight]
  R -->|Within limit and valid| S[Approve rule proposal transaction]
  R -->|Warning| T[Edit rule text]
  R -->|Rejected| U[Rule rejection state]
  T --> R
  S --> E
  E --> V[Active Rule of the Hour]
  V --> W[Draw and verification]
  W --> X[Result and near-miss feedback]
  X --> Y{Reward available?}
  Y -->|Winner| Z[Payout status]
  Y -->|Rule creator| AA[Creator reward status]
  Y -->|No| AB[Share result card]
  Z --> AB
  AA --> AB
  AB --> E
```

## First-Time User Flow

1. User lands on `/play`.
2. The live round hub shows prize, countdown, current action, and compact explanation of the loop.
3. User connects wallet from a single primary action.
4. After wallet return, the hub confirms connected status and exposes number selection.
5. User selects six unique numbers, reviews fees, and approves `submit_guess`.
6. The DApp waits for confirmation and then shows the current-turn Game Token status.
7. Voting and rule proposal become available after Game Token issuance.

## Returning User Flow

1. User opens `/play` with an already known wallet session.
2. The hub restores current turn state, submitted guess status, Game Token status, votes, proposals, and pending rewards.
3. If the user has not submitted a guess for the current turn, number selection is the primary action.
4. If the user already submitted a guess, voting, proposing, result tracking, and sharing become primary actions.
5. If the previous turn has unclaimed payout or creator reward status, a compact reward banner appears without blocking the current turn.

## Wallet Connection And Transaction Return Flow

```mermaid
sequenceDiagram
  participant User
  participant DApp as Mobile DApp
  participant Wallet
  participant API
  participant Chain as Solana

  User->>DApp: Tap action that requires wallet
  DApp->>Wallet: Open connect or transaction approval
  Wallet-->>DApp: Return with approval, rejection, or timeout
  DApp->>API: Poll transaction or session status
  API->>Chain: Read confirmation state
  Chain-->>API: Confirmed, pending, failed, or expired
  API-->>DApp: Normalized status
  DApp-->>User: Resume at exact originating step
```

Mobile wallet interruption rules:

- The DApp must preserve the originating action and form state before leaving for wallet approval.
- On return, the user must land on the same step with a visible transaction status.
- Pending transactions must not silently reset the flow.
- Failed or rejected transactions must return to an editable review state.

## Action Flows

### Number Selection

1. Enter from `/play` primary CTA.
2. Select exactly six unique numbers from 1 to 100.
3. Show selected numbers in a sticky tray.
4. Enable review only when exactly six numbers are selected.
5. Submit through wallet transaction approval.
6. On confirmation, show Game Token issued and unlock gated actions.

### Free-Form Rule Proposal

1. Enter from bottom navigation or post-guess prompt.
2. User writes natural language rule text.
3. Client requests token count and preflight.
4. Warning state appears near the 80-token limit before hard rejection.
5. Rejection states must show a clear reason and preserve editable text.
6. Passing preflight returns a short-lived preflight token.
7. User approves proposal transaction.
8. Proposed rule appears with compilation status.

### Voting

1. Enter from rule list, live hub, or active rule panel.
2. User reviews eligible rules with vote count, status, and audit link.
3. Voting requires current-turn Game Token.
4. User approves vote transaction.
5. The UI returns to the rule list with pending or confirmed vote status.

### Result And Sharing

1. Draw state appears when guesses close and draw is pending.
2. Verification state appears while original and alternative conditions are evaluated.
3. Result state shows drawn numbers, original result, alternative rule result, near-miss feedback, payout status, and creator reward status.
4. Share card flow creates a non-sensitive summary with turn id, draw numbers, near-miss label, and active rule title.
